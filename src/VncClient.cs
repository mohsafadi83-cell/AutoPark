using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace AutoPark
{
    /// <summary>
    /// Pure C# VNC (RFB 3.3 / 3.7 / 3.8 / Siemens Sm@rtServer 3.889) client.
    /// Connects to 192.168.0.30:5900, authenticates (None or VNC DES challenge-response),
    /// negotiates 32-bpp BGRX Raw/CopyRect framebuffer updates, and sends mouse/touch & keyboard events.
    /// </summary>
    public class RfBClient : IDisposable
    {
        TcpClient _tcp;
        NetworkStream _stream;
        Thread _readerThread;
        volatile bool _running;
        readonly object _writeLock = new object();
        readonly object _bmpLock = new object();

        public int FbWidth { get; private set; }
        public int FbHeight { get; private set; }
        public string ServerName { get; private set; }
        public string ServerVersion { get; private set; }
        public bool IsConnected { get { return _running && _tcp != null && _tcp.Connected; } }

        Bitmap _framebuffer;
        public event Action<Bitmap> FrameUpdated;
        public event Action<string> StatusChanged;
        public event Action<string> Disconnected;

        public static void ParseHostPort(string input, int defaultPort, out string host, out int port)
        {
            host = (input ?? "").Trim();
            port = defaultPort > 0 ? defaultPort : 5900;
            if (host.StartsWith("vnc://", StringComparison.OrdinalIgnoreCase))
                host = host.Substring(6);
            if (host.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
                host = host.Substring(7);

            int slash = host.IndexOf('/');
            if (slash >= 0) host = host.Substring(0, slash);

            int colon = host.LastIndexOf(':');
            if (colon > 0)
            {
                int parsedPort;
                string portPart = host.Substring(colon + 1).Trim();
                // Handle VNC display numbers (:0 -> 5900, :1 -> 5901) or HTTP VNC port (5800 -> 5900)
                if (int.TryParse(portPart, out parsedPort))
                {
                    if (parsedPort < 100) port = 5900 + parsedPort;
                    else if (parsedPort >= 5800 && parsedPort < 5900) port = parsedPort + 100; // 5800 is HTTP Java Applet; 5900 is RFB VNC
                    else port = parsedPort;
                }
                host = host.Substring(0, colon).Trim();
            }
            if (port >= 5800 && port < 5900) port += 100;
            if (string.IsNullOrEmpty(host)) host = "192.168.0.30";
        }

        public static string DiagnoseHost(string rawHost, int defaultPort, string password)
        {
            string host;
            int port;
            ParseHostPort(rawHost, defaultPort, out host, out port);

            bool pingOk = false;
            long pingMs = -1;
            try
            {
                using (var p = new Ping())
                {
                    var rep = p.Send(host, 1200);
                    if (rep != null && rep.Status == IPStatus.Success)
                    {
                        pingOk = true;
                        pingMs = rep.RoundtripTime;
                    }
                }
            }
            catch { }

            using (var tcp = new TcpClient())
            {
                var sw = System.Diagnostics.Stopwatch.StartNew();
                var ar = tcp.BeginConnect(host, port, null, null);
                bool tcpOk = ar.AsyncWaitHandle.WaitOne(2500) && tcp.Connected;
                if (!tcpOk)
                {
                    if (!pingOk)
                    {
                        throw new Exception(
                            "الجهاز (" + host + ") غير مرئي على الشبكة حالياً (Ping Timeout).\n" +
                            "• تأكد من توصيل كابل الشبكة (Ethernet) بين الكمبيوتر والماكنة/السويتش.\n" +
                            "• تأكد أن عنوان الكمبيوتر على نفس الشبكة (192.168.0.x) وأن شاشة الماكنة (192.168.0.30) شغالة.");
                    }
                    throw new Exception(
                        "الجهاز (" + host + ") يرد على Ping (" + pingMs + "ms)، لكن منفذ VNC (" + port + ") مغلق!\n" +
                        "• تأكد من تفعيل خدمة Sm@rtServer / VNC داخل إعدادات شاشة Siemens HMI.");
                }
                tcp.EndConnect(ar);
                sw.Stop();
                tcp.ReceiveTimeout = 3000;
                tcp.SendTimeout = 3000;
                var st = tcp.GetStream();
                byte[] banner = new byte[12];
                int n = ReadExact(st, banner, 0, 12);
                string ver = Encoding.ASCII.GetString(banner, 0, n).Trim();
                if (!ver.StartsWith("RFB "))
                {
                    throw new Exception("المنفذ " + host + ":" + port + " مفتوح لكنه لا يرد ببروتوكول VNC (RFB). الرد: " + ver);
                }
                return "متصل بنجاح بخادم VNC على " + host + ":" + port + " (بروتوكول " + ver + " — زمن الاستجابة " + sw.ElapsedMilliseconds + "ms)";
            }
        }

        public void Connect(string rawHost, int defaultPort, string password)
        {
            Disconnect();

            string host;
            int port;
            ParseHostPort(rawHost, defaultPort, out host, out port);

            NotifyStatus("جاري الاتصال بـ VNC على " + host + ":" + port + "...");
            _tcp = new TcpClient();
            var ar = _tcp.BeginConnect(host, port, null, null);
            if (!ar.AsyncWaitHandle.WaitOne(3500) || !_tcp.Connected)
            {
                _tcp.Close();
                _tcp = null;
                DiagnoseHost(host, port, password);
                return;
            }
            _tcp.EndConnect(ar);
            _tcp.NoDelay = true;
            _stream = _tcp.GetStream();

            // 1. Read RFB ProtocolVersion (12 bytes: "RFB 003.008\n" or "RFB 003.003\n" or Siemens "RFB 003.889\n")
            byte[] verBuf = new byte[12];
            ReadExact(_stream, verBuf, 0, 12);
            ServerVersion = Encoding.ASCII.GetString(verBuf).Trim();
            if (!ServerVersion.StartsWith("RFB "))
                throw new Exception("رد غير صالح من خادم VNC: " + ServerVersion);

            // Echo safest compatible version (3.3 for 003.003 or Siemens 003.889; 3.8 for >= 003.008)
            bool use33 = ServerVersion.Contains("003.003") || ServerVersion.Contains("003.889") || ServerVersion.Contains("003.006");
            bool use37 = ServerVersion.Contains("003.007");
            string clientVer = use33 ? "RFB 003.003\n" : (use37 ? "RFB 003.007\n" : "RFB 003.008\n");
            byte[] cVerBytes = Encoding.ASCII.GetBytes(clientVer);
            _stream.Write(cVerBytes, 0, 12);
            _stream.Flush();

            // 2. Security handshake
            int secType = 0;
            if (use33)
            {
                secType = ReadInt32BE(_stream);
                if (secType == 0)
                    throw new Exception("رفض خادم VNC الاتصال: " + ReadReasonString(_stream));
            }
            else
            {
                int count = _stream.ReadByte();
                if (count <= 0)
                    throw new Exception("رفض خادم VNC الاتصال: " + ReadReasonString(_stream));
                byte[] types = new byte[count];
                ReadExact(_stream, types, 0, count);
                // Prefer None (1) or VNC Auth (2)
                for (int i = 0; i < count; i++)
                {
                    if (types[i] == 1 || types[i] == 2) { secType = types[i]; break; }
                }
                if (secType == 0) secType = types[0];
                _stream.WriteByte((byte)secType);
                _stream.Flush();
            }

            if (secType == 2) // VNC Authentication (16-byte DES challenge)
            {
                byte[] challenge = new byte[16];
                ReadExact(_stream, challenge, 0, 16);
                byte[] response = EncryptVncChallenge(challenge, password ?? "");
                _stream.Write(response, 0, 16);
                _stream.Flush();

                int authResult = ReadInt32BE(_stream);
                if (authResult != 0)
                    throw new Exception("كلمة مرور VNC (Sm@rtServer Password) غير صحيحة!");
            }
            else if (secType == 1 && !use33 && !use37)
            {
                int authResult = ReadInt32BE(_stream);
                if (authResult != 0)
                    throw new Exception("فشل التحقق من أمان VNC.");
            }
            else if (secType != 1 && secType != 2)
            {
                throw new Exception("نوع تشفير VNC غير مدعوم (" + secType + ").");
            }

            // 3. ClientInit: Shared-flag = 1 (required by Siemens Sm@rtServer!)
            _stream.WriteByte(1);
            _stream.Flush();

            // 4. ServerInit: width (2), height (2), pixel-format (16), name-length (4), name
            int w = ReadUInt16BE(_stream);
            int h = ReadUInt16BE(_stream);
            byte[] pixFmt = new byte[16];
            ReadExact(_stream, pixFmt, 0, 16);
            int nameLen = ReadInt32BE(_stream);
            byte[] nameBuf = new byte[Math.Max(0, Math.Min(nameLen, 4096))];
            if (nameBuf.Length > 0) ReadExact(_stream, nameBuf, 0, nameBuf.Length);
            ServerName = Encoding.UTF8.GetString(nameBuf);

            FbWidth = w > 0 ? w : 480;
            FbHeight = h > 0 ? h : 272;
            lock (_bmpLock)
            {
                _framebuffer = new Bitmap(FbWidth, FbHeight, PixelFormat.Format32bppRgb);
            }

            // 5. Send SetPixelFormat (32-bpp, depth 24, little-endian, true-color, R=255@16, G=255@8, B=255@0)
            byte[] setPf = new byte[20];
            setPf[0] = 0; // SetPixelFormat
            setPf[4] = 32; // bits-per-pixel
            setPf[5] = 24; // depth
            setPf[6] = 0;  // big-endian = false
            setPf[7] = 1;  // true-color = true
            setPf[8] = 0; setPf[9] = 255;   // red-max = 255
            setPf[10] = 0; setPf[11] = 255; // green-max = 255
            setPf[12] = 0; setPf[13] = 255; // blue-max = 255
            setPf[14] = 16; // red-shift
            setPf[15] = 8;  // green-shift
            setPf[16] = 0;  // blue-shift
            lock (_writeLock)
            {
                _stream.Write(setPf, 0, 20);
                // 6. Send SetEncodings: Raw (0) and CopyRect (1)
                byte[] setEnc = new byte[]
                {
                    2, 0, 0, 2, // SetEncodings, 2 encodings
                    0, 0, 0, 0, // Raw = 0
                    0, 0, 0, 1  // CopyRect = 1
                };
                _stream.Write(setEnc, 0, setEnc.Length);
                _stream.Flush();
            }

            _running = true;
            NotifyStatus("🟢 متصل بشاشة الماكنة VNC: " + ServerName + " (" + FbWidth + "x" + FbHeight + ")");
            RequestFramebufferUpdate(false);

            _readerThread = new Thread(ReadLoop) { IsBackground = true, Name = "VncReader" };
            _readerThread.Start();
        }

        public void RequestFramebufferUpdate(bool incremental)
        {
            if (!IsConnected) return;
            byte[] req = new byte[10];
            req[0] = 3; // FramebufferUpdateRequest
            req[1] = (byte)(incremental ? 1 : 0);
            req[2] = 0; req[3] = 0; // x = 0
            req[4] = 0; req[5] = 0; // y = 0
            req[6] = (byte)((FbWidth >> 8) & 0xFF);
            req[7] = (byte)(FbWidth & 0xFF);
            req[8] = (byte)((FbHeight >> 8) & 0xFF);
            req[9] = (byte)(FbHeight & 0xFF);
            try
            {
                lock (_writeLock)
                {
                    _stream.Write(req, 0, 10);
                    _stream.Flush();
                }
            }
            catch { }
        }

        public void TapCoordinate(int x, int y)
        {
            if (!IsConnected) return;
            SendPointerEvent(x, y, 1);
            Thread.Sleep(140);
            SendPointerEvent(x, y, 0);
            RequestFramebufferUpdate(false);
        }

        public static bool TryTapOneShot(AppSettings settings, int x, int y, out string message)
        {
            message = "";
            if (settings == null) return false;
            try
            {
                using (var c = new RfBClient())
                {
                    c.Connect(settings.PlcIp, settings.PlcPort, settings.VncPassword);
                    Thread.Sleep(150);
                    c.TapCoordinate(x, y);
                    Thread.Sleep(150);
                    message = "تم إرسال نبضة اللمس إلى شاشة الماكنة (" + settings.PlcIp + ":" + settings.PlcPort + ") عند الإحداثيات (" + x + "," + y + ")";
                    return true;
                }
            }
            catch (Exception ex)
            {
                message = ex.Message;
                return false;
            }
        }

        public void SendPointerEvent(int x, int y, byte buttonMask)
        {
            if (!IsConnected) return;
            if (x < 0) x = 0; if (y < 0) y = 0;
            if (x >= FbWidth) x = FbWidth - 1;
            if (y >= FbHeight) y = FbHeight - 1;

            byte[] msg = new byte[6];
            msg[0] = 5; // PointerEvent
            msg[1] = buttonMask;
            msg[2] = (byte)((x >> 8) & 0xFF);
            msg[3] = (byte)(x & 0xFF);
            msg[4] = (byte)((y >> 8) & 0xFF);
            msg[5] = (byte)(y & 0xFF);
            try
            {
                lock (_writeLock)
                {
                    _stream.Write(msg, 0, 6);
                    _stream.Flush();
                }
            }
            catch { }
        }

        public void SendKeyEvent(uint keysym, bool down)
        {
            if (!IsConnected) return;
            byte[] msg = new byte[8];
            msg[0] = 4; // KeyEvent
            msg[1] = (byte)(down ? 1 : 0);
            msg[4] = (byte)((keysym >> 24) & 0xFF);
            msg[5] = (byte)((keysym >> 16) & 0xFF);
            msg[6] = (byte)((keysym >> 8) & 0xFF);
            msg[7] = (byte)(keysym & 0xFF);
            try
            {
                lock (_writeLock)
                {
                    _stream.Write(msg, 0, 8);
                    _stream.Flush();
                }
            }
            catch { }
        }

        void ReadLoop()
        {
            try
            {
                while (_running && _tcp != null && _tcp.Connected)
                {
                    int msgType = _stream.ReadByte();
                    if (msgType < 0) break;

                    if (msgType == 0) // FramebufferUpdate
                    {
                        _stream.ReadByte(); // padding
                        int numRects = ReadUInt16BE(_stream);
                        for (int i = 0; i < numRects; i++)
                        {
                            int rx = ReadUInt16BE(_stream);
                            int ry = ReadUInt16BE(_stream);
                            int rw = ReadUInt16BE(_stream);
                            int rh = ReadUInt16BE(_stream);
                            int enc = ReadInt32BE(_stream);

                            if (enc == 0) // Raw encoding (32-bpp)
                            {
                                byte[] pixels = new byte[rw * rh * 4];
                                ReadExact(_stream, pixels, 0, pixels.Length);
                                lock (_bmpLock)
                                {
                                    if (_framebuffer != null && rx + rw <= _framebuffer.Width && ry + rh <= _framebuffer.Height)
                                    {
                                        var rect = new Rectangle(rx, ry, rw, rh);
                                        var data = _framebuffer.LockBits(rect, ImageLockMode.WriteOnly, PixelFormat.Format32bppRgb);
                                        try
                                        {
                                            for (int row = 0; row < rh; row++)
                                            {
                                                IntPtr destRow = IntPtr.Add(data.Scan0, row * data.Stride);
                                                Marshal.Copy(pixels, row * rw * 4, destRow, rw * 4);
                                            }
                                        }
                                        finally
                                        {
                                            _framebuffer.UnlockBits(data);
                                        }
                                    }
                                }
                            }
                            else if (enc == 1) // CopyRect
                            {
                                int srcX = ReadUInt16BE(_stream);
                                int srcY = ReadUInt16BE(_stream);
                                lock (_bmpLock)
                                {
                                    if (_framebuffer != null)
                                    {
                                        using (var g = Graphics.FromImage(_framebuffer))
                                        {
                                            g.DrawImage(_framebuffer, new Rectangle(rx, ry, rw, rh), new Rectangle(srcX, srcY, rw, rh), GraphicsUnit.Pixel);
                                        }
                                    }
                                }
                            }
                        }

                        Bitmap snapshot = null;
                        lock (_bmpLock)
                        {
                            if (_framebuffer != null) snapshot = (Bitmap)_framebuffer.Clone();
                        }
                        if (snapshot != null && FrameUpdated != null) FrameUpdated(snapshot);

                        Thread.Sleep(40);
                        RequestFramebufferUpdate(true);
                    }
                    else if (msgType == 1) // SetColourMapEntries
                    {
                        _stream.ReadByte();
                        ReadUInt16BE(_stream);
                        int nCols = ReadUInt16BE(_stream);
                        byte[] skip = new byte[nCols * 6];
                        ReadExact(_stream, skip, 0, skip.Length);
                    }
                    else if (msgType == 2) // Bell
                    {
                        // ignore
                    }
                    else if (msgType == 3) // ServerCutText
                    {
                        byte[] pad = new byte[3];
                        ReadExact(_stream, pad, 0, 3);
                        int len = ReadInt32BE(_stream);
                        byte[] txt = new byte[Math.Max(0, len)];
                        if (len > 0) ReadExact(_stream, txt, 0, len);
                    }
                }
            }
            catch (Exception ex)
            {
                if (_running && Disconnected != null) Disconnected(ex.Message);
            }
            finally
            {
                _running = false;
            }
        }

        static byte[] EncryptVncChallenge(byte[] challenge, string password)
        {
            byte[] key = new byte[8];
            byte[] pwBytes = Encoding.ASCII.GetBytes(password ?? "");
            for (int i = 0; i < 8 && i < pwBytes.Length; i++)
            {
                // VNC reverses the bit order of each byte in the DES key
                byte b = pwBytes[i];
                byte rev = 0;
                for (int bit = 0; bit < 8; bit++)
                {
                    if ((b & (1 << bit)) != 0) rev |= (byte)(1 << (7 - bit));
                }
                key[i] = rev;
            }

            using (var des = new DESCryptoServiceProvider())
            {
                des.Mode = CipherMode.ECB;
                des.Padding = PaddingMode.None;
                des.Key = key;
                using (var enc = des.CreateEncryptor(key, new byte[8]))
                {
                    byte[] outBuf = new byte[16];
                    enc.TransformBlock(challenge, 0, 8, outBuf, 0);
                    enc.TransformBlock(challenge, 8, 8, outBuf, 8);
                    return outBuf;
                }
            }
        }

        static int ReadExact(Stream s, byte[] buf, int offset, int count)
        {
            int total = 0;
            while (total < count)
            {
                int n = s.Read(buf, offset + total, count - total);
                if (n <= 0) throw new EndOfStreamException("انقطع الاتصال بخادم VNC.");
                total += n;
            }
            return total;
        }

        static int ReadUInt16BE(Stream s)
        {
            byte[] b = new byte[2];
            ReadExact(s, b, 0, 2);
            return (b[0] << 8) | b[1];
        }

        static int ReadInt32BE(Stream s)
        {
            byte[] b = new byte[4];
            ReadExact(s, b, 0, 4);
            return (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3];
        }

        static string ReadReasonString(Stream s)
        {
            try
            {
                int len = ReadInt32BE(s);
                if (len <= 0 || len > 4096) return "رفض الخادم الاتصال";
                byte[] b = new byte[len];
                ReadExact(s, b, 0, len);
                return Encoding.UTF8.GetString(b);
            }
            catch
            {
                return "رفض الخادم الاتصال";
            }
        }

        void NotifyStatus(string msg)
        {
            if (StatusChanged != null) StatusChanged(msg);
        }

        public void Disconnect()
        {
            _running = false;
            try { if (_stream != null) _stream.Close(); } catch { }
            try { if (_tcp != null) _tcp.Close(); } catch { }
            _stream = null;
            _tcp = null;
        }

        public void Dispose()
        {
            Disconnect();
            lock (_bmpLock)
            {
                if (_framebuffer != null)
                {
                    _framebuffer.Dispose();
                    _framebuffer = null;
                }
            }
        }
    }

    /// <summary>
    /// Embedded VNC HMI Viewer Page inside AutoPark.exe — connects directly to 192.168.0.30:5900
    /// and forwards mouse/touch clicks to the Siemens KTP400 Basic HMI screen.
    /// </summary>
    class VncViewerPage : Panel
    {
        readonly MainForm _shell;
        readonly TextBox _txtAddress;
        readonly TextBox _txtPassword;
        readonly Label _lblStatus;
        readonly PictureBox _screenBox;
        readonly RfBClient _client = new RfBClient();
        readonly TextBox _txtPlcTag;
        readonly TextBox _txtPlcVal;
        readonly Label _lblPlcLive;
        readonly System.Windows.Forms.Timer _plcPollTimer;
        byte _mouseButtons = 0;

        public VncViewerPage(MainForm shell)
        {
            _shell = shell;
            BackColor = Theme.Back;

            var topCard = new Card { Dock = DockStyle.Top, Height = 86, Padding = new Padding(16, 10, 16, 10) };

            var lblAddr = Theme.Label("عنوان شاشة الماكنة (VNC IP:Port):", Theme.Semi(9.5f), Theme.Ink);
            lblAddr.SetBounds(16, 10, 210, 20);
            _txtAddress = new TextBox
            {
                Text = string.IsNullOrEmpty(shell.Settings.HmiVncIp) ? "192.168.0.30:5900" : shell.Settings.HmiVncIp,
                Font = Theme.F(10.5f),
                RightToLeft = RightToLeft.No
            };
            _txtAddress.SetBounds(16, 34, 210, 32);

            var lblPass = Theme.Label("كلمة مرور VNC (إن وجدت):", Theme.Semi(9.5f), Theme.Ink);
            lblPass.SetBounds(240, 10, 170, 20);
            _txtPassword = new TextBox
            {
                Text = shell.Settings.VncPassword ?? "",
                UseSystemPasswordChar = true,
                Font = Theme.F(10.5f),
                RightToLeft = RightToLeft.No
            };
            _txtPassword.SetBounds(240, 34, 150, 32);

            var btnConnect = new ModernButton
            {
                Text = "اتصال بشاشة الماكنة (Connect VNC)",
                IconGlyph = Icons.Plug,
                BaseColor = Theme.Primary,
                HoverColor = Theme.PrimaryHover
            };
            btnConnect.SetBounds(406, 30, 235, 40);
            btnConnect.Click += delegate { ConnectNow(); };

            var btnDiag = new ModernButton
            {
                Text = "فحص الشبكة والمنفذ 5900",
                IconGlyph = Icons.Search,
                BaseColor = Theme.Blue,
                HoverColor = Color.FromArgb(29, 78, 216)
            };
            btnDiag.SetBounds(650, 30, 190, 40);
            btnDiag.Click += delegate { RunDiagnostic(); };

            _lblStatus = Theme.Label("جاهز للاتصال بشاشة الماكنة عبر VNC (" + _txtAddress.Text + ")", Theme.Semi(9.5f), Theme.Muted);
            _lblStatus.SetBounds(854, 26, 360, 44);

            topCard.Controls.AddRange(new Control[] { lblAddr, _txtAddress, lblPass, _txtPassword, btnConnect, btnDiag, _lblStatus });

            var viewerCard = new Card
            {
                Dock = DockStyle.Fill,
                Margin = new Padding(0, 12, 0, 0),
                Padding = new Padding(12),
                FillColor = Color.FromArgb(15, 23, 42)
            };

            // Quick hardware keypad on the right side matching TECHNO Electrical.Jo Spot Selection (L11..L43)
            var keypadCard = new Card
            {
                Dock = DockStyle.Right,
                Width = 380,
                Margin = new Padding(12, 12, 0, 0),
                Padding = new Padding(14)
            };

            var kpTitle = Theme.Label("تحكم مباشر بأزرار الماكنة (L11..L43) + S7-1200", Theme.Bold(10.2f), Theme.Primary);
            kpTitle.Dock = DockStyle.Top;
            kpTitle.Height = 28;

            var spotsGrid = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                Height = 195,
                ColumnCount = 4,
                RowCount = 3,
                RightToLeft = RightToLeft.No
            };
            for (int c = 0; c < 4; c++) spotsGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 25f));
            for (int r = 0; r < 3; r++) spotsGrid.RowStyles.Add(new RowStyle(SizeType.Percent, 33.33f));

            for (int lane = 1; lane <= 4; lane++)
            {
                for (int p = 1; p <= 3; p++)
                {
                    string code = "L" + lane + p;
                    int tx = ParkState.LaneCenterX[lane - 1];
                    int ty = ParkState.RowCenterY[p - 1];
                    var b = new ModernButton
                    {
                        Text = code + "\n(P" + p + ")",
                        Font = Theme.Bold(9.5f),
                        BaseColor = Color.FromArgb(51, 65, 85),
                        HoverColor = Theme.Primary,
                        PressColor = Theme.PrimaryPress,
                        Dock = DockStyle.Fill,
                        Margin = new Padding(3)
                    };
                    b.Click += delegate { TapOnHmi(tx, ty, "تم ضغط المصف " + code + " على شاشة الماكنة"); };
                    spotsGrid.Controls.Add(b, lane - 1, p - 1);
                }
            }

            var extraPanel = new Panel { Dock = DockStyle.Top, Height = 96, Padding = new Padding(0, 8, 0, 0) };
            var btnAdmin = new ModernButton
            {
                Text = "👤 زر Administrator على الشاشة (235, 247)",
                BaseColor = Theme.Blue,
                HoverColor = Color.FromArgb(29, 78, 216),
                Dock = DockStyle.Top,
                Height = 38
            };
            btnAdmin.Click += delegate { TapOnHmi(235, 247, "تم ضغط زر Administrator على شاشة الماكنة"); };

            var btnAlarmHmi = new ModernButton
            {
                Text = "⚠️ زر التنبيهات على الشاشة [⚠] (23, 112)",
                BaseColor = Theme.Amber,
                HoverColor = Color.FromArgb(180, 83, 9),
                Dock = DockStyle.Bottom,
                Height = 38
            };
            btnAlarmHmi.Click += delegate { TapOnHmi(23, 112, "تم ضغط زر التنبيهات على شاشة الماكنة"); };

            extraPanel.Controls.Add(btnAdmin);
            extraPanel.Controls.Add(btnAlarmHmi);

            // Direct S7-1200 PLC Tag Control & Live Status Panel
            var plcPanel = new Panel { Dock = DockStyle.Fill, Padding = new Padding(0, 10, 0, 0) };
            var lblPlcHead = Theme.Label("⚡ تحكم وقراءة مباشرة SIMATIC S7-1200 (192.168.0.27:102)", Theme.Bold(9.5f), Theme.Ink);
            lblPlcHead.SetBounds(0, 8, 350, 20);

            var lblTag = Theme.Label("العنوان (M10.0 / MB13 / DB1,B0):", Theme.F(8.5f), Theme.Muted);
            lblTag.SetBounds(0, 32, 185, 18);
            _txtPlcTag = new TextBox { Text = "M10.0", Font = Theme.F(9.5f), RightToLeft = RightToLeft.No };
            _txtPlcTag.SetBounds(0, 52, 140, 28);

            var lblVal = Theme.Label("القيمة:", Theme.F(8.5f), Theme.Muted);
            lblVal.SetBounds(148, 32, 60, 18);
            _txtPlcVal = new TextBox { Text = "1", Font = Theme.F(9.5f), RightToLeft = RightToLeft.No };
            _txtPlcVal.SetBounds(148, 52, 55, 28);

            var btnPulse = new ModernButton
            {
                Text = "نبضة Pulse",
                Font = Theme.Bold(8.5f),
                BaseColor = Theme.Primary,
                HoverColor = Theme.PrimaryHover
            };
            btnPulse.SetBounds(210, 49, 72, 32);
            btnPulse.Click += delegate { SendPlcWrite(300); };

            var btnWrite = new ModernButton
            {
                Text = "كتابة Write",
                Font = Theme.Bold(8.5f),
                BaseColor = Theme.Blue,
                HoverColor = Color.FromArgb(29, 78, 216)
            };
            btnWrite.SetBounds(286, 49, 66, 32);
            btnWrite.Click += delegate { SendPlcWrite(0); };

            _lblPlcLive = new Label
            {
                Text = "جاري قراءة حالة S7-1200 الحية...",
                Font = new Font("Consolas", 8.5f, FontStyle.Regular),
                ForeColor = Color.FromArgb(16, 185, 129),
                BackColor = Color.FromArgb(15, 23, 42),
                Padding = new Padding(8),
                RightToLeft = RightToLeft.No,
                TextAlign = ContentAlignment.TopLeft
            };
            _lblPlcLive.SetBounds(0, 88, 352, 145);

            plcPanel.Controls.AddRange(new Control[] { lblPlcHead, lblTag, _txtPlcTag, lblVal, _txtPlcVal, btnPulse, btnWrite, _lblPlcLive });

            keypadCard.Controls.Add(plcPanel);
            keypadCard.Controls.Add(extraPanel);
            keypadCard.Controls.Add(spotsGrid);
            keypadCard.Controls.Add(kpTitle);

            _screenBox = new PictureBox
            {
                Dock = DockStyle.Fill,
                BackColor = Color.FromArgb(15, 23, 42),
                SizeMode = PictureBoxSizeMode.Zoom,
                Cursor = Cursors.Cross
            };
            _screenBox.MouseDown += OnScreenMouseDown;
            _screenBox.MouseMove += OnScreenMouseMove;
            _screenBox.MouseUp += OnScreenMouseUp;

            viewerCard.Controls.Add(_screenBox);

            Controls.Add(viewerCard);
            Controls.Add(keypadCard);
            Controls.Add(topCard);

            _plcPollTimer = new System.Windows.Forms.Timer { Interval = 1500 };
            _plcPollTimer.Tick += delegate { PollPlcLive(); };
            _plcPollTimer.Start();
            PollPlcLive();

            _client.StatusChanged += msg =>
            {
                if (IsHandleCreated) BeginInvoke(new Action(delegate
                {
                    _lblStatus.ForeColor = Theme.Ok;
                    _lblStatus.Text = msg;
                }));
            };

            _client.Disconnected += err =>
            {
                if (IsHandleCreated) BeginInvoke(new Action(delegate
                {
                    _lblStatus.ForeColor = Theme.Err;
                    _lblStatus.Text = "انقطع اتصال VNC: " + err;
                }));
            };

            _client.FrameUpdated += bmp =>
            {
                if (IsHandleCreated) BeginInvoke(new Action(delegate
                {
                    var old = _screenBox.Image;
                    _screenBox.Image = bmp;
                    if (old != null) old.Dispose();
                }));
            };

            Disposed += delegate
            {
                try { _plcPollTimer.Stop(); _plcPollTimer.Dispose(); } catch { }
                _client.Dispose();
            };
        }

        void PollPlcLive()
        {
            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    string baseUrl = "http://localhost:3000/api/v1";
                    var req = (System.Net.HttpWebRequest)System.Net.WebRequest.Create(baseUrl + "/industrial/s7/live");
                    req.Method = "GET";
                    req.Timeout = 1400;
                    using (var resp = (System.Net.HttpWebResponse)req.GetResponse())
                    using (var sr = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                    {
                        string json = sr.ReadToEnd();
                        bool conn = json.IndexOf("\"connected\":true", StringComparison.OrdinalIgnoreCase) >= 0;
                        string ib0 = ExtractJsonInt(json, "IB0");
                        string ib2 = ExtractJsonInt(json, "IB2");
                        string qb2 = ExtractJsonInt(json, "QB2");
                        string mb3 = ExtractJsonInt(json, "MB3");
                        string mb7 = ExtractJsonInt(json, "MB7");
                        string mb9 = ExtractJsonInt(json, "MB9");
                        string mb13 = ExtractJsonInt(json, "MB13");
                        string mb60 = ExtractJsonInt(json, "MB60");

                        string summary = (conn ? "🟢 S7-1200 ONLINE (192.168.0.27:102)\r\n" : "🔴 S7-1200 OFFLINE\r\n") +
                            "Inputs : IB0=" + ib0 + " (I0.4,I0.7) | IB2=" + ib2 + " (I2.4..7)\r\n" +
                            "Outputs: QB0=0 | QB1=0 | QB2=" + qb2 + " (Q2.3=ON)\r\n" +
                            "Merkers: MB3=" + mb3 + " MB7=" + mb7 + " MB9=" + mb9 + "\r\n" +
                            "Pos/Clk: MB13=" + mb13 + " (Spot/Pos) | MB60=" + mb60 + "\r\n" +
                            "HMI VNC: 192.168.0.30:5900 (480x272)";

                        if (IsHandleCreated)
                        {
                            BeginInvoke(new Action(delegate
                            {
                                _lblPlcLive.ForeColor = conn ? Color.FromArgb(16, 185, 129) : Color.FromArgb(248, 113, 113);
                                _lblPlcLive.Text = summary;
                            }));
                        }
                    }
                }
                catch
                {
                    // ignore transient polling error
                }
            });
        }

        static string ExtractJsonInt(string json, string key)
        {
            string pat = "\"" + key + "\":";
            int idx = json.IndexOf(pat, StringComparison.Ordinal);
            if (idx < 0) return "-";
            idx += pat.Length;
            while (idx < json.Length && (json[idx] == ' ' || json[idx] == '\t')) idx++;
            int start = idx;
            while (idx < json.Length && (char.IsDigit(json[idx]) || json[idx] == '-')) idx++;
            return idx > start ? json.Substring(start, idx - start) : "-";
        }

        void SendPlcWrite(int pulseMs)
        {
            string addr = (_txtPlcTag.Text ?? "").Trim();
            string valStr = (_txtPlcVal.Text ?? "1").Trim();
            if (string.IsNullOrEmpty(addr)) return;

            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    string baseUrl = "http://localhost:3000/api/v1";
                    var req = (System.Net.HttpWebRequest)System.Net.WebRequest.Create(baseUrl + "/industrial/s7/write");
                    req.Method = "POST";
                    req.ContentType = "application/json; charset=utf-8";
                    req.Timeout = 3000;
                    int numVal = 1;
                    int.TryParse(valStr, out numVal);
                    string body = "{\"address\":\"" + addr + "\",\"value\":" + numVal + ",\"pulseMs\":" + pulseMs + "}";
                    byte[] data = Encoding.UTF8.GetBytes(body);
                    using (var st = req.GetRequestStream()) st.Write(data, 0, data.Length);
                    using (var resp = (System.Net.HttpWebResponse)req.GetResponse())
                    using (var sr = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                    {
                        string res = sr.ReadToEnd();
                        if (IsHandleCreated)
                        {
                            BeginInvoke(new Action(delegate
                            {
                                _lblStatus.ForeColor = Theme.Ok;
                                _lblStatus.Text = "⚡ تم إرسال الأمر إلى S7-1200 (" + addr + " = " + numVal + (pulseMs > 0 ? " نبضة" : "") + ")";
                            }));
                        }
                    }
                    PollPlcLive();
                }
                catch (Exception ex)
                {
                    if (IsHandleCreated)
                    {
                        BeginInvoke(new Action(delegate
                        {
                            _lblStatus.ForeColor = Theme.Err;
                            _lblStatus.Text = "❌ خطأ كتابة PLC: " + ex.Message;
                        }));
                    }
                }
            });
        }

        void SaveInputToSettings()
        {
            string host;
            int port;
            RfBClient.ParseHostPort(_txtAddress.Text, 5900, out host, out port);
            _shell.Settings.Protocol = "VNC";
            _shell.Settings.PlcIp = host;
            _shell.Settings.PlcPort = port;
            _shell.Settings.VncPassword = _txtPassword.Text;
            _shell.Settings.Save();
            _shell.UpdateFooterStatus();
        }

        void RunDiagnostic()
        {
            SaveInputToSettings();
            try
            {
                string res = RfBClient.DiagnoseHost(_txtAddress.Text, 5900, _txtPassword.Text);
                _lblStatus.ForeColor = Theme.Ok;
                _lblStatus.Text = "✅ " + res;
                MessageBox.Show(res, "فحص اتصال VNC (192.168.0.30:5900)", MessageBoxButtons.OK, MessageBoxIcon.Information,
                    MessageBoxDefaultButton.Button1, MessageBoxOptions.RtlReading | MessageBoxOptions.RightAlign);
            }
            catch (Exception ex)
            {
                _lblStatus.ForeColor = Theme.Err;
                _lblStatus.Text = "❌ " + ex.Message;
                MessageBox.Show(ex.Message, "نتيجة تشخيص الاتصال بـ " + _txtAddress.Text, MessageBoxButtons.OK, MessageBoxIcon.Warning,
                    MessageBoxDefaultButton.Button1, MessageBoxOptions.RtlReading | MessageBoxOptions.RightAlign);
            }
        }

        void TapOnHmi(int x, int y, string statusMsg)
        {
            if (!_client.IsConnected)
            {
                ConnectNow();
            }
            if (_client.IsConnected)
            {
                _client.TapCoordinate(x, y);
                _lblStatus.ForeColor = Theme.Ok;
                _lblStatus.Text = "🟢 " + statusMsg + " (" + x + "," + y + ")";
            }
        }

        void ConnectNow()
        {
            SaveInputToSettings();
            try
            {
                _client.Connect(_txtAddress.Text, 5900, _txtPassword.Text);
            }
            catch (Exception ex)
            {
                _lblStatus.ForeColor = Theme.Err;
                _lblStatus.Text = "❌ " + ex.Message;
                MessageBox.Show(ex.Message, "تعذر الاتصال عبر VNC", MessageBoxButtons.OK, MessageBoxIcon.Warning,
                    MessageBoxDefaultButton.Button1, MessageBoxOptions.RtlReading | MessageBoxOptions.RightAlign);
            }
        }

        bool MapToFramebuffer(int boxX, int boxY, out int fbX, out int fbY)
        {
            fbX = 0; fbY = 0;
            if (!_client.IsConnected || _client.FbWidth <= 0 || _client.FbHeight <= 0) return false;
            int bw = _screenBox.ClientSize.Width;
            int bh = _screenBox.ClientSize.Height;
            if (bw <= 0 || bh <= 0) return false;

            float ratio = Math.Min((float)bw / _client.FbWidth, (float)bh / _client.FbHeight);
            int dispW = (int)(_client.FbWidth * ratio);
            int dispH = (int)(_client.FbHeight * ratio);
            int offX = (bw - dispW) / 2;
            int offY = (bh - dispH) / 2;

            if (boxX < offX || boxY < offY || boxX >= offX + dispW || boxY >= offY + dispH) return false;
            fbX = (int)((boxX - offX) / ratio);
            fbY = (int)((boxY - offY) / ratio);
            return true;
        }

        void OnScreenMouseDown(object sender, MouseEventArgs e)
        {
            int x, y;
            if (!MapToFramebuffer(e.X, e.Y, out x, out y)) return;
            if (e.Button == MouseButtons.Left) _mouseButtons |= 1;
            if (e.Button == MouseButtons.Right) _mouseButtons |= 4;
            _client.SendPointerEvent(x, y, _mouseButtons);
        }

        void OnScreenMouseMove(object sender, MouseEventArgs e)
        {
            int x, y;
            if (!MapToFramebuffer(e.X, e.Y, out x, out y)) return;
            _client.SendPointerEvent(x, y, _mouseButtons);
        }

        void OnScreenMouseUp(object sender, MouseEventArgs e)
        {
            int x, y;
            if (!MapToFramebuffer(e.X, e.Y, out x, out y)) return;
            if (e.Button == MouseButtons.Left) _mouseButtons &= unchecked((byte)~1);
            if (e.Button == MouseButtons.Right) _mouseButtons &= unchecked((byte)~4);
            _client.SendPointerEvent(x, y, _mouseButtons);
        }
    }
}
