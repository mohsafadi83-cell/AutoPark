using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Windows.Forms;

namespace AutoParkLauncher
{
    public class MainForm : Form
    {
        private Process serverProcess;
        private Label statusLabel;
        private Label lanUrlLabel;
        private TextBox logBox;
        private Button btnOpenMobile;
        private Button btnOpenAdmin;
        private Button btnOpenSwagger;
        private Button btnRestart;
        private CheckBox chkAutoOpen;

        public MainForm()
        {
            this.Text = "AutoPark.exe — مركز تشغيل منظومة المواقف الذكية (12 مصف)";
            this.Size = new Size(780, 560);
            this.MinimumSize = new Size(740, 500);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(13, 21, 32);
            this.ForeColor = Color.FromArgb(230, 238, 248);
            this.Font = new Font("Segoe UI", 10F, FontStyle.Regular);

            var headerPanel = new Panel
            {
                Dock = DockStyle.Top,
                Height = 96,
                BackColor = Color.FromArgb(18, 30, 46),
                Padding = new Padding(20, 14, 20, 14)
            };

            var titleLabel = new Label
            {
                Text = "AUTO PARK (.EXE) | منظومة المواقف الذكية المؤتمتة — الأردن (12 مصف)",
                Font = new Font("Segoe UI", 13.5F, FontStyle.Bold),
                ForeColor = Color.FromArgb(56, 189, 248),
                AutoSize = true,
                Location = new Point(20, 14)
            };

            statusLabel = new Label
            {
                Text = "⏳ جاري تشغيل قاعدة البيانات والخادم الصناعي وتطبيق الموبايل...",
                Font = new Font("Segoe UI", 10.5F, FontStyle.Bold),
                ForeColor = Color.FromArgb(250, 204, 21),
                AutoSize = true,
                Location = new Point(20, 50)
            };

            headerPanel.Controls.Add(titleLabel);
            headerPanel.Controls.Add(statusLabel);

            var bodyPanel = new Panel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(20)
            };

            btnOpenMobile = CreateButton(
                "📱 فتح تطبيق الموبايل\n(http://localhost:5174)",
                Color.FromArgb(14, 165, 233),
                new Point(20, 16),
                new Size(225, 68)
            );
            btnOpenMobile.Click += (s, e) => OpenMobileAppWindow();

            btnOpenAdmin = CreateButton(
                "🖥️ فتح لوحة تحكم الأدمن\n(http://localhost:5173)",
                Color.FromArgb(16, 185, 129),
                new Point(255, 16),
                new Size(225, 68)
            );
            btnOpenAdmin.Click += (s, e) => OpenUrl("http://localhost:5173/");

            btnOpenSwagger = CreateButton(
                "📘 توثيق الـ API\n(Swagger UI)",
                Color.FromArgb(51, 65, 85),
                new Point(490, 16),
                new Size(135, 68)
            );
            btnOpenSwagger.Click += (s, e) => OpenUrl("http://localhost:3000/api/docs");

            btnRestart = CreateButton(
                "🔄 إعادة تشغيل",
                Color.FromArgb(71, 85, 105),
                new Point(635, 16),
                new Size(105, 68)
            );
            btnRestart.Click += (s, e) => RestartServer();

            chkAutoOpen = new CheckBox
            {
                Text = "فتح لوحة التحكم وتطبيق الموبايل تلقائياً عند اكتمال التشغيل",
                Checked = true,
                AutoSize = true,
                ForeColor = Color.FromArgb(203, 213, 225),
                Location = new Point(20, 94)
            };

            string lanIp = GetLocalIPv4();
            lanUrlLabel = new Label
            {
                Text = string.Format(
                    "🌐 رابط الموبايل عبر الـ Wi-Fi:  http://{0}:5174   |   الأدمن:  http://{0}:5173   |   الدخول: superadmin / Admin@12345",
                    lanIp
                ),
                Font = new Font("Segoe UI", 9.3F, FontStyle.Regular),
                ForeColor = Color.FromArgb(148, 163, 184),
                AutoSize = true,
                Location = new Point(20, 122)
            };

            logBox = new TextBox
            {
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Vertical,
                BackColor = Color.FromArgb(9, 14, 22),
                ForeColor = Color.FromArgb(167, 243, 208),
                Font = new Font("Consolas", 9.2F),
                BorderStyle = BorderStyle.FixedSingle,
                Location = new Point(20, 152),
                Size = new Size(720, 255),
                Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right
            };

            bodyPanel.Controls.Add(btnOpenMobile);
            bodyPanel.Controls.Add(btnOpenAdmin);
            bodyPanel.Controls.Add(btnOpenSwagger);
            bodyPanel.Controls.Add(btnRestart);
            bodyPanel.Controls.Add(chkAutoOpen);
            bodyPanel.Controls.Add(lanUrlLabel);
            bodyPanel.Controls.Add(logBox);

            this.Controls.Add(bodyPanel);
            this.Controls.Add(headerPanel);

            this.Load += (s, e) => StartServer();
            this.FormClosing += (s, e) => StopServer();
        }

        private Button CreateButton(string text, Color bg, Point location, Size size)
        {
            var btn = new Button
            {
                Text = text,
                BackColor = bg,
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9.5F, FontStyle.Bold),
                Location = location,
                Size = size,
                Cursor = Cursors.Hand
            };
            btn.FlatAppearance.BorderSize = 0;
            return btn;
        }

        private bool hasAutoOpened = false;

        private void AppendLog(string line)
        {
            if (string.IsNullOrEmpty(line)) return;
            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action<string>(AppendLog), line);
                return;
            }
            logBox.AppendText("[" + DateTime.Now.ToString("HH:mm:ss") + "] " + line + Environment.NewLine);
            if (line.Contains("AUTOPARK_READY") || line.Contains("Nest application successfully started"))
            {
                statusLabel.Text = "🟢 النظام يعمل بنجاح (Online) — الموبايل (:5174) | الأدمن (:5173) | API (:3000)";
                statusLabel.ForeColor = Color.FromArgb(52, 211, 153);
                if (chkAutoOpen.Checked && !hasAutoOpened)
                {
                    hasAutoOpened = true;
                    OpenUrl("http://localhost:5173/");
                    OpenMobileAppWindow();
                }
            }
        }

        private void StartServer()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                // If launched from Desktop or symlink, fall back to d:\Auto Parke if local folders aren't next to the exe
                if (!Directory.Exists(Path.Combine(baseDir, "app")) &&
                    !Directory.Exists(Path.Combine(baseDir, "backend")) &&
                    Directory.Exists(@"d:\Auto Parke\backend"))
                {
                    baseDir = @"d:\Auto Parke\";
                }

                string backendDir = Path.Combine(baseDir, "app");
                if (!Directory.Exists(backendDir))
                {
                    backendDir = Path.Combine(baseDir, "backend");
                }
                if (!Directory.Exists(backendDir))
                {
                    backendDir = baseDir;
                }

                string nodeExe = Path.Combine(baseDir, "runtime", "node.exe");
                if (!File.Exists(nodeExe))
                {
                    nodeExe = Path.Combine(backendDir, "runtime", "node.exe");
                }
                if (!File.Exists(nodeExe))
                {
                    nodeExe = @"C:\Program Files\nodejs\node.exe";
                }
                if (!File.Exists(nodeExe))
                {
                    nodeExe = "node.exe";
                }

                string scriptPath = Path.Combine(backendDir, "dist", "standalone.js");
                if (!File.Exists(scriptPath))
                {
                    AppendLog("ERROR: Could not find " + scriptPath);
                    statusLabel.Text = "🔴 لم يتم العثور على ملفات الخادم (dist/standalone.js)";
                    statusLabel.ForeColor = Color.FromArgb(248, 113, 113);
                    return;
                }

                AppendLog("Starting Auto Park Ecosystem via: " + nodeExe);
                var psi = new ProcessStartInfo
                {
                    FileName = nodeExe,
                    Arguments = "\"" + scriptPath + "\"",
                    WorkingDirectory = backendDir,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                    StandardOutputEncoding = Encoding.UTF8,
                    StandardErrorEncoding = Encoding.UTF8
                };

                serverProcess = new Process { StartInfo = psi, EnableRaisingEvents = true };
                serverProcess.OutputDataReceived += (s, e) => AppendLog(e.Data);
                serverProcess.ErrorDataReceived += (s, e) => AppendLog(e.Data);
                serverProcess.Start();
                serverProcess.BeginOutputReadLine();
                serverProcess.BeginErrorReadLine();
            }
            catch (Exception ex)
            {
                AppendLog("Failed to start server: " + ex.Message);
                statusLabel.Text = "🔴 خطأ في تشغيل الخادم: " + ex.Message;
                statusLabel.ForeColor = Color.FromArgb(248, 113, 113);
            }
        }

        private void StopServer()
        {
            try
            {
                if (serverProcess != null && !serverProcess.HasExited)
                {
                    try
                    {
                        var killer = Process.Start(new ProcessStartInfo
                        {
                            FileName = "taskkill",
                            Arguments = "/PID " + serverProcess.Id + " /T /F",
                            CreateNoWindow = true,
                            UseShellExecute = false
                        });
                        if (killer != null) killer.WaitForExit(3000);
                    }
                    catch
                    {
                        serverProcess.Kill();
                    }
                }
            }
            catch { }
        }

        private void RestartServer()
        {
            statusLabel.Text = "⏳ جاري إعادة تشغيل الخادم...";
            statusLabel.ForeColor = Color.FromArgb(250, 204, 21);
            StopServer();
            StartServer();
        }

        private void OpenMobileAppWindow()
        {
            string url = "http://localhost:5174/";
            string[] browsers = new string[]
            {
                @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                @"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
                @"C:\Program Files\Google\Chrome\Application\chrome.exe"
            };
            foreach (var b in browsers)
            {
                if (File.Exists(b))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = b,
                        Arguments = "--app=" + url + " --window-size=430,880",
                        UseShellExecute = true
                    });
                    return;
                }
            }
            OpenUrl(url);
        }

        private void OpenUrl(string url)
        {
            try
            {
                Process.Start(new ProcessStartInfo { FileName = url, UseShellExecute = true });
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "Auto Park", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static string GetLocalIPv4()
        {
            try
            {
                using (Socket socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, 0))
                {
                    socket.Connect("8.8.8.8", 65530);
                    IPEndPoint endPoint = socket.LocalEndPoint as IPEndPoint;
                    if (endPoint != null) return endPoint.Address.ToString();
                }
            }
            catch { }
            return "localhost";
        }

        [STAThread]
        public static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }
}
