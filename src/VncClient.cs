using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace AutoPark
{
    /// <summary>
    /// Host/Port parser helper preserved for settings & PLC address parsing (no VNC dependency required).
    /// </summary>
    public class RfBClient : IDisposable
    {
        public static void ParseHostPort(string raw, int defaultPort, out string host, out int port)
        {
            host = (raw ?? "").Trim();
            port = defaultPort > 0 ? defaultPort : 102;
            if (host.StartsWith("vnc://", StringComparison.OrdinalIgnoreCase))
                host = host.Substring(6);
            else if (host.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
                host = host.Substring(7);
            else if (host.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                host = host.Substring(8);

            int slash = host.IndexOf('/');
            if (slash >= 0) host = host.Substring(0, slash);

            int colon = host.LastIndexOf(':');
            if (colon > 0 && colon < host.Length - 1)
            {
                int parsedPort;
                if (int.TryParse(host.Substring(colon + 1).Trim(), out parsedPort) && parsedPort > 0 && parsedPort <= 65535)
                {
                    port = parsedPort;
                    host = host.Substring(0, colon).Trim();
                }
            }
        }

        public void Dispose() { }
    }

    /// <summary>
    /// Standalone Direct HMI Console (replaces legacy VNC Viewer — runs 100% standalone without VNC!).
    /// Executes parking operations, mode switches, safe resets, and direct S7-1200 tag commands
    /// via ParkState + Siemens S7 backend API (with seamless local standalone fallback when offline).
    /// </summary>
    class VncViewerPage : Panel
    {
        readonly MainForm _shell;
        readonly Label _lblModeBadge;
        readonly Label _lblStatus;
        readonly Label _lblSelectedInfo;
        readonly Label _lblPlcLive;
        readonly TextBox _txtPlate;
        readonly TextBox _txtPlcTag;
        readonly TextBox _txtPlcVal;
        readonly TableLayoutPanel _hmiGrid;
        readonly Dictionary<string, ModernButton> _bayButtons = new Dictionary<string, ModernButton>();
        readonly System.Windows.Forms.Timer _pollTimer;

        string _selectedBayCode = "L11";

        public VncViewerPage(MainForm shell)
        {
            _shell = shell;
            BackColor = Theme.Back;
            Dock = DockStyle.Fill;

            DockStyle startDock = Loc.IsArabic ? DockStyle.Right : DockStyle.Left;
            DockStyle endDock = Loc.IsArabic ? DockStyle.Left : DockStyle.Right;

            // 1. Top Status & Mode Control Bar (Standalone / Direct S7 — Zero VNC Required)
            var topCard = new Card { Dock = DockStyle.Top, Height = 76, Padding = new Padding(14, 10, 14, 10) };

            _lblModeBadge = Theme.Label(
                Loc.T("⚡ STANDALONE DIRECT HMI — NO VNC REQUIRED", "⚡ شاشة الماكنة المباشرة (مستقلة — بدون VNC)"),
                Theme.Bold(10.5f), Theme.Primary);
            _lblModeBadge.Dock = DockStyle.Top;
            _lblModeBadge.Height = 24;

            _lblStatus = Theme.Label(
                Loc.T("Ready — Direct S7-1200 / Standalone Local execution active.", "جاهز — التشغيل المباشر والمستقل مفعّل بدون الحاجة لاتصال VNC."),
                Theme.Semi(9f), Theme.Muted);
            _lblStatus.Dock = DockStyle.Fill;

            var leftInfo = new Panel { Dock = DockStyle.Fill, BackColor = Color.Transparent };
            leftInfo.Controls.Add(_lblStatus);
            leftInfo.Controls.Add(_lblModeBadge);

            var btnAuto = MakeTopBtn(Loc.T("AUTO Mode", "وضع تلقائي"), Icons.Check, Theme.Ok, Color.FromArgb(21, 128, 61), Color.White);
            btnAuto.Click += delegate { ExecuteModeSwitch(true); };

            var btnManual = MakeTopBtn(Loc.T("MANUAL Mode", "وضع يدوي"), Icons.Lock, Theme.Amber, Color.FromArgb(180, 83, 9), Color.White);
            btnManual.Click += delegate { ExecuteModeSwitch(false); };

            var btnReset = MakeTopBtn(Loc.T("Safe Reset", "تصفير آمن"), Icons.Refresh, Theme.Blue, Color.FromArgb(29, 78, 216), Color.White);
            btnReset.Click += delegate { ExecuteSafeReset(); };

            topCard.Controls.Add(leftInfo);
            topCard.Controls.Add(Theme.Holder(btnReset, endDock, 118, new Padding(4, 6, 0, 6)));
            topCard.Controls.Add(Theme.Holder(btnManual, endDock, 126, new Padding(4, 6, 4, 6)));
            topCard.Controls.Add(Theme.Holder(btnAuto, endDock, 118, new Padding(4, 6, 4, 6)));

            // 2. Main Split Layout: Left Standalone HMI Touch Console (12 Bays) + Right Direct S7 Controls
            var mainSplit = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 1,
                Padding = new Padding(0, 10, 0, 0)
            };
            mainSplit.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 62f));
            mainSplit.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 38f));
            mainSplit.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));

            // Left: Standalone Virtual KTP400 HMI Screen (No VNC framebuffer!)
            var hmiCard = new Card
            {
                Dock = DockStyle.Fill,
                Margin = new Padding(0, 0, 10, 0),
                Padding = new Padding(16),
                FillColor = Color.FromArgb(15, 23, 42)
            };

            var hmiHeader = Theme.Label(
                Loc.T("TECHNO Electrical.Jo — Direct HMI Bay Matrix (4 Lanes × 3 Floors: P3 Top → P1 Bottom)",
                      "TECHNO Electrical.Jo — مصفوفة الماكنة المباشرة (4 مسارات × 3 طوابق: P3 علوي → P1 سفلي)"),
                Theme.Bold(10f), Color.FromArgb(56, 189, 248));
            hmiHeader.Dock = DockStyle.Top;
            hmiHeader.Height = 30;

            _hmiGrid = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 4,
                RowCount = 3,
                Padding = new Padding(0, 8, 0, 8),
                RightToLeft = RightToLeft.No,
                BackColor = Color.Transparent
            };
            for (int c = 0; c < 4; c++) _hmiGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 25f));
            for (int r = 0; r < 3; r++) _hmiGrid.RowStyles.Add(new RowStyle(SizeType.Percent, 33.33f));

            // Row 0 = P3 (Top), Row 1 = P2 (Mid), Row 2 = P1 (Bottom)
            for (int row = 0; row < 3; row++)
            {
                int floor = 3 - row;
                for (int lane = 1; lane <= 4; lane++)
                {
                    string code = "L" + lane + floor;
                    string captured = code;
                    var b = new ModernButton
                    {
                        Text = code + "\nP" + floor,
                        Font = Theme.Bold(11f),
                        BaseColor = Color.FromArgb(30, 41, 59),
                        HoverColor = Theme.Primary,
                        PressColor = Theme.PrimaryPress,
                        ForeColor = Color.White,
                        BorderColor = Color.FromArgb(71, 85, 105),
                        Dock = DockStyle.Fill,
                        Margin = new Padding(6)
                    };
                    b.Click += delegate
                    {
                        _selectedBayCode = captured;
                        RefreshBayMatrix();
                    };
                    _bayButtons[code] = b;
                    _hmiGrid.Controls.Add(b, lane - 1, row);
                }
            }

            // Bottom quick action bar inside HMI console (Direct Park / Retrieve on selected bay)
            var hmiFooter = new Panel { Dock = DockStyle.Bottom, Height = 56, Padding = new Padding(0, 8, 0, 0), BackColor = Color.Transparent };

            var lblPlate = Theme.Label(Loc.T("Plate:", "اللوحة:"), Theme.Bold(9.5f), Color.White);
            lblPlate.Dock = startDock;
            lblPlate.Width = 56;

            _txtPlate = new TextBox
            {
                Text = "22-78910",
                Font = Theme.Bold(10.5f),
                RightToLeft = RightToLeft.No
            };

            var btnParkIn = MakeTopBtn(Loc.T("Park IN (Selected)", "إيداع في المصف"), Icons.Park, Theme.Primary, Theme.PrimaryHover, Color.White);
            btnParkIn.Click += delegate { ExecuteDirectBayOp(true); };

            var btnRetrieveOut = MakeTopBtn(Loc.T("Retrieve OUT", "استرجاع من المصف"), Icons.Car, Theme.Blue, Color.FromArgb(29, 78, 216), Color.White);
            btnRetrieveOut.Click += delegate { ExecuteDirectBayOp(false); };

            hmiFooter.Controls.Add(Theme.Holder(btnRetrieveOut, endDock, 152, new Padding(6, 2, 0, 2)));
            hmiFooter.Controls.Add(Theme.Holder(btnParkIn, endDock, 160, new Padding(6, 2, 4, 2)));
            hmiFooter.Controls.Add(Theme.Holder(_txtPlate, startDock, 145, new Padding(6, 10, 8, 6)));
            hmiFooter.Controls.Add(lblPlate);

            hmiCard.Controls.Add(_hmiGrid);
            hmiCard.Controls.Add(hmiFooter);
            hmiCard.Controls.Add(hmiHeader);

            // Right: Direct Operations, Page Shortcuts & Live S7-1200 Tag Console
            var rightCard = new Card { Dock = DockStyle.Fill, Padding = new Padding(14), AutoScroll = true };
            var rStack = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                ColumnCount = 1,
                RowCount = 0,
                GrowStyle = TableLayoutPanelGrowStyle.AddRows
            };
            rStack.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));

            // Selected Bay Details
            var lblSelHead = Theme.Label(Loc.T("Selected Bay & Direct PLC Sequence", "المصف المحدد وأوامر التتابع المباشرة"), Theme.Bold(10f), Theme.Primary);
            lblSelHead.Dock = DockStyle.Top;
            lblSelHead.Height = 26;
            rStack.Controls.Add(lblSelHead);

            _lblSelectedInfo = Theme.Label("", Theme.Semi(9.5f), Theme.Ink);
            _lblSelectedInfo.Dock = DockStyle.Top;
            _lblSelectedInfo.Height = 52;
            _lblSelectedInfo.BackColor = Theme.Back;
            _lblSelectedInfo.Padding = new Padding(10, 6, 10, 6);
            rStack.Controls.Add(_lblSelectedInfo);

            // Direct HMI Sequence + Screen Shortcuts (replaces VNC pixel taps!)
            var seqGrid = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                Height = 96,
                ColumnCount = 2,
                RowCount = 2,
                Margin = new Padding(0, 8, 0, 8)
            };
            seqGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
            seqGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
            seqGrid.RowStyles.Add(new RowStyle(SizeType.Percent, 50f));
            seqGrid.RowStyles.Add(new RowStyle(SizeType.Percent, 50f));

            var btnStep1 = MakeGridBtn(Loc.T("Step 1 OK (DB2,X6.0)", "تأكيد الخطوة 1"), Theme.Primary);
            btnStep1.Click += delegate { SendTagQuick("DB2,X6.0", 1, 350, "Park_Step1_OK"); };

            var btnStep2 = MakeGridBtn(Loc.T("Step 2 OK (DB2,X6.1)", "تأكيد الخطوة 2"), Theme.Primary);
            btnStep2.Click += delegate { SendTagQuick("DB2,X6.1", 1, 350, "Park_Step2_OK"); };

            var btnOpenManual = MakeGridBtn(Loc.T("Manual Maintenance", "الصيانة اليدوية"), Theme.Blue);
            btnOpenManual.Click += delegate { _shell.Navigate(new ManualMaintenancePage(_shell), Loc.T("Safe Manual & Maintenance Mode (Hold-to-Run)", "وضع الصيانة والتحكم اليدوي الآمن")); };

            var btnOpenAlarms = MakeGridBtn(Loc.T("Industrial Alarms", "التنبيهات والأعطال"), Theme.Amber);
            btnOpenAlarms.Click += delegate { _shell.Navigate(new AlarmsPage(_shell), Loc.T("Industrial Alarms & Faults", "التنبيهات والأعطال الصناعية")); };

            seqGrid.Controls.Add(btnStep1, 0, 0);
            seqGrid.Controls.Add(btnStep2, 1, 0);
            seqGrid.Controls.Add(btnOpenManual, 0, 1);
            seqGrid.Controls.Add(btnOpenAlarms, 1, 1);
            rStack.Controls.Add(seqGrid);

            // Direct S7-1200 PLC Tag Write Box
            var lblPlcHead = Theme.Label(Loc.T("Direct S7-1200 Tag Write (No VNC)", "كتابة مباشرة لعناوين S7-1200 (بدون VNC)"), Theme.Bold(9.5f), Theme.Ink);
            lblPlcHead.Dock = DockStyle.Top;
            lblPlcHead.Height = 24;
            rStack.Controls.Add(lblPlcHead);

            var tagRow = new Panel { Dock = DockStyle.Top, Height = 58, Margin = new Padding(0, 2, 0, 8) };
            var lblTag = Theme.Label(Loc.T("Tag Address (DB1,X0.3 / M10.0):", "العنوان (DB1,X0.3 / M10.0):"), Theme.F(8.5f), Theme.Muted);
            lblTag.SetBounds(0, 0, 210, 18);
            _txtPlcTag = new TextBox { Text = "M10.0", Font = Theme.F(9.5f), RightToLeft = RightToLeft.No };
            _txtPlcTag.SetBounds(0, 22, 140, 28);

            var lblVal = Theme.Label(Loc.T("Val:", "قيمة:"), Theme.F(8.5f), Theme.Muted);
            lblVal.SetBounds(146, 0, 48, 18);
            _txtPlcVal = new TextBox { Text = "1", Font = Theme.F(9.5f), RightToLeft = RightToLeft.No };
            _txtPlcVal.SetBounds(146, 22, 48, 28);

            var btnPulse = MakeGridBtn(Loc.T("Pulse", "نبضة"), Theme.Primary);
            btnPulse.Dock = DockStyle.None;
            btnPulse.SetBounds(200, 19, 72, 32);
            btnPulse.Click += delegate { SendPlcWrite(300); };

            var btnWrite = MakeGridBtn(Loc.T("Write", "كتابة"), Theme.Blue);
            btnWrite.Dock = DockStyle.None;
            btnWrite.SetBounds(276, 19, 70, 32);
            btnWrite.Click += delegate { SendPlcWrite(0); };

            tagRow.Controls.AddRange(new Control[] { lblTag, _txtPlcTag, lblVal, _txtPlcVal, btnPulse, btnWrite });
            rStack.Controls.Add(tagRow);

            // Live S7-1200 / Standalone Telemetry Console
            var lblLiveHead = Theme.Label(Loc.T("Live PLC / Standalone Engine Telemetry", "قراءة حالة الـ PLC / التشغيل المستقل"), Theme.Bold(9.5f), Theme.Ink);
            lblLiveHead.Dock = DockStyle.Top;
            lblLiveHead.Height = 24;
            rStack.Controls.Add(lblLiveHead);

            _lblPlcLive = new Label
            {
                Text = "Initializing Standalone Direct HMI...",
                Font = new Font("Consolas", 8.5f, FontStyle.Regular),
                ForeColor = Color.FromArgb(134, 239, 172),
                BackColor = Color.FromArgb(15, 23, 42),
                Padding = new Padding(10),
                RightToLeft = RightToLeft.No,
                TextAlign = ContentAlignment.TopLeft,
                Dock = DockStyle.Top,
                Height = 160
            };
            rStack.Controls.Add(_lblPlcLive);

            rightCard.Controls.Add(rStack);

            mainSplit.Controls.Add(hmiCard, 0, 0);
            mainSplit.Controls.Add(rightCard, 1, 0);

            Controls.Add(mainSplit);
            Controls.Add(topCard);

            ParkState.Instance.Changed += RefreshBayMatrix;
            _pollTimer = new System.Windows.Forms.Timer { Interval = 2500 };
            _pollTimer.Tick += delegate { PollPlcLive(); };
            _pollTimer.Start();

            Disposed += delegate
            {
                ParkState.Instance.Changed -= RefreshBayMatrix;
                try { _pollTimer.Stop(); _pollTimer.Dispose(); } catch { }
            };

            RefreshBayMatrix();
            PollPlcLive();
        }

        ModernButton MakeTopBtn(string text, string icon, Color bg, Color hover, Color fg)
        {
            return new ModernButton
            {
                Text = text,
                IconGlyph = icon,
                IconSize = 9.5f,
                Font = Theme.Semi(9f),
                BaseColor = bg,
                HoverColor = hover,
                PressColor = Theme.PrimaryPress,
                ForeColor = fg,
                Dock = DockStyle.Fill
            };
        }

        ModernButton MakeGridBtn(string text, Color bg)
        {
            return new ModernButton
            {
                Text = text,
                Font = Theme.Bold(8.8f),
                BaseColor = bg,
                HoverColor = Theme.PrimaryHover,
                PressColor = Theme.PrimaryPress,
                ForeColor = Color.White,
                Dock = DockStyle.Fill,
                Margin = new Padding(3)
            };
        }

        void RefreshBayMatrix()
        {
            if (IsDisposed) return;
            var st = ParkState.Instance;
            SpaceItem selectedSpace = null;

            foreach (var sp in st.Spaces)
            {
                ModernButton btn;
                if (!_bayButtons.TryGetValue(sp.SpaceNumber, out btn)) continue;

                bool isSelected = string.Equals(sp.SpaceNumber, _selectedBayCode, StringComparison.OrdinalIgnoreCase);
                if (isSelected) selectedSpace = sp;

                string plateLine = string.IsNullOrEmpty(sp.PlateNumber) ? Loc.T("EMPTY", "فارغ") : sp.PlateNumber;
                btn.Text = sp.SpaceNumber + "  (P" + sp.PositionInColumn + ")\n" + plateLine;

                if (sp.Status == "OCCUPIED")
                {
                    btn.BaseColor = isSelected ? Theme.Blue : Color.FromArgb(30, 58, 138);
                    btn.BorderColor = isSelected ? Color.Gold : Color.FromArgb(59, 130, 246);
                }
                else if (sp.Status == "MOVING")
                {
                    btn.BaseColor = Theme.Amber;
                    btn.BorderColor = Color.White;
                }
                else
                {
                    btn.BaseColor = isSelected ? Theme.Primary : Color.FromArgb(20, 83, 45);
                    btn.BorderColor = isSelected ? Color.Gold : Theme.Ok;
                }
            }

            if (selectedSpace != null)
            {
                _lblSelectedInfo.Text = string.Format(
                    Loc.T("Selected: {0} (Lane {1}, Floor P{2}) — Status: {3}\nPlate: {4}",
                          "المصف المحدد: {0} (مسار {1}، طابق P{2}) — الحالة: {3}\nاللوحة: {4}"),
                    selectedSpace.SpaceNumber, selectedSpace.ColumnNumber, selectedSpace.PositionInColumn, selectedSpace.Status,
                    string.IsNullOrEmpty(selectedSpace.PlateNumber) ? "-" : selectedSpace.PlateNumber);
            }
        }

        void ExecuteDirectBayOp(bool isParkIn)
        {
            var st = ParkState.Instance;
            if (st.EmergencyStop)
            {
                SetStatus(Loc.T("Blocked: Emergency Stop is active!", "ممنوع: زر إيقاف الطوارئ مفعّل!"), Theme.Err);
                return;
            }

            var sp = st.Spaces.Find(x => string.Equals(x.SpaceNumber, _selectedBayCode, StringComparison.OrdinalIgnoreCase));
            if (sp == null) return;

            string plate = (_txtPlate.Text ?? "").Trim();
            if (isParkIn)
            {
                if (string.IsNullOrEmpty(plate)) plate = "JO-" + DateTime.Now.ToString("HHmm");
                sp.Status = "OCCUPIED";
                sp.PlateNumber = plate;
                sp.OwnerName = Loc.UserDisplay(_shell.CurrentUser);
                sp.ParkedByUsername = _shell.CurrentUser.Username;
                sp.UpdatedAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm");
                st.RecordLocalAudit("PARK", sp.SpaceNumber, plate + " (Standalone Direct HMI)", Loc.UserDisplay(_shell.CurrentUser));
                st.Save();
                st.NotifyChanged();
                SetStatus(Loc.T("Parked " + plate + " in " + sp.SpaceNumber + " directly (No VNC).", "تم إيداع " + plate + " في " + sp.SpaceNumber + " مباشرة بدون VNC."), Theme.Ok);
                SendTagQuick("DB2,X6.3", 1, 350, "Park_IN (" + sp.SpaceNumber + ")");
            }
            else
            {
                string prevPlate = string.IsNullOrEmpty(sp.PlateNumber) ? "-" : sp.PlateNumber;
                sp.Status = "AVAILABLE";
                sp.PlateNumber = "";
                sp.OwnerName = "";
                sp.ParkedByUsername = "";
                sp.UpdatedAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm");
                st.RecordLocalAudit("RETRIEVE", sp.SpaceNumber, prevPlate + " (Standalone Direct HMI)", Loc.UserDisplay(_shell.CurrentUser));
                st.Save();
                st.NotifyChanged();
                SetStatus(Loc.T("Retrieved " + prevPlate + " from " + sp.SpaceNumber + " directly (No VNC).", "تم استرجاع " + prevPlate + " من " + sp.SpaceNumber + " مباشرة بدون VNC."), Theme.Ok);
                SendTagQuick("DB2,X6.4", 1, 350, "Park_OUT (" + sp.SpaceNumber + ")");
            }
        }

        void ExecuteModeSwitch(bool autoMode)
        {
            var st = ParkState.Instance;
            st.Sensors.AutoMode = autoMode;
            st.Sensors.ManualMode = !autoMode;
            string key = autoMode ? "auto_mode_tag" : "manual_mode_tag";
            SetStatus(autoMode
                ? Loc.T("Switched to AUTO Mode (DB1,X0.3)", "تم التحويل إلى الوضع التلقائي AUTO (DB1,X0.3)")
                : Loc.T("Switched to MANUAL Mode (DB1,X0.5)", "تم التحويل إلى الوضع اليدوي MANUAL (DB1,X0.5)"),
                Theme.Ok);

            ThreadPool.QueueUserWorkItem(delegate
            {
                if (st.BackendConnected) st.SendManualControl(key, true);
            });
            st.NotifyChanged();
        }

        void ExecuteSafeReset()
        {
            var st = ParkState.Instance;
            st.EmergencyStop = false;
            st.Sensors.EmergencyPhysical = false;
            SetStatus(Loc.T("Sent Safe Reset (M0.5 + ParkDB.Reset DB2,X10.0)", "تم إرسال تصفير آمن (M0.5 + ParkDB.Reset)"), Theme.Ok);
            ThreadPool.QueueUserWorkItem(delegate
            {
                if (st.BackendConnected) st.SendRecoveryAction("SAFE_RESET");
            });
            st.NotifyChanged();
        }

        void SendTagQuick(string addr, int val, int pulseMs, string label)
        {
            ThreadPool.QueueUserWorkItem(delegate
            {
                var st = ParkState.Instance;
                if (!st.BackendConnected)
                {
                    SetStatus(Loc.T("Standalone Local Executed: " + label + " (" + addr + "=" + val + ")", "تم التنفيذ محلياً (مستقل): " + label), Theme.Primary);
                    return;
                }
                string res = st.SendPlcWrite(addr, val, pulseMs);
                if (res != null && res.StartsWith("ERR:"))
                    SetStatus(Loc.T("Local OK (PLC offline): " + label, "تم محلياً (الـ PLC غير متصل حالياً): " + label), Theme.Amber);
                else
                    SetStatus(Loc.T("PLC S7 Sent: " + label + " (" + addr + "=" + val + ")", "تم الإرسال إلى S7-1200: " + label), Theme.Ok);
                PollPlcLive();
            });
        }

        void SendPlcWrite(int pulseMs)
        {
            string addr = (_txtPlcTag.Text ?? "").Trim();
            string valStr = (_txtPlcVal.Text ?? "1").Trim();
            if (string.IsNullOrEmpty(addr)) return;
            int numVal = 1;
            int.TryParse(valStr, out numVal);
            SendTagQuick(addr, numVal, pulseMs, addr);
        }

        void SetStatus(string msg, Color color)
        {
            if (IsDisposed || !IsHandleCreated) return;
            try
            {
                BeginInvoke((Action)delegate
                {
                    _lblStatus.ForeColor = color;
                    _lblStatus.Text = msg;
                });
            }
            catch { }
        }

        void PollPlcLive()
        {
            ThreadPool.QueueUserWorkItem(delegate
            {
                var st = ParkState.Instance;
                string summary;
                Color col;

                if (st.BackendConnected && !string.IsNullOrEmpty(st.BackendToken))
                {
                    string json = st.GetApiRaw("/industrial/s7/live");
                    if (!string.IsNullOrEmpty(json) && !json.StartsWith("ERR:"))
                    {
                        bool conn = json.IndexOf("\"connected\":true", StringComparison.OrdinalIgnoreCase) >= 0;
                        string ib0 = ExtractJsonInt(json, "IB0");
                        string ib2 = ExtractJsonInt(json, "IB2");
                        string qb2 = ExtractJsonInt(json, "QB2");
                        string mb3 = ExtractJsonInt(json, "MB3");
                        string mb7 = ExtractJsonInt(json, "MB7");
                        string mb13 = ExtractJsonInt(json, "MB13");
                        string mb60 = ExtractJsonInt(json, "MB60");

                        summary =
                            (conn ? "● S7-1200 ONLINE (192.168.0.27:102 — DIRECT)\r\n" : "● STANDALONE MODE (PLC OFFLINE — NO VNC)\r\n") +
                            "API Server : " + st.ApiBaseUrl + "\r\n" +
                            "Mode       : " + (st.Sensors.ManualMode ? "MANUAL" : "AUTO") + " | E-Stop: " + (st.EmergencyStop ? "ACTIVE" : "CLEAR") + "\r\n" +
                            "Inputs     : IB0=" + ib0 + " | IB2=" + ib2 + " | QB2=" + qb2 + "\r\n" +
                            "Merkers    : MB3=" + mb3 + " | MB7=" + mb7 + " | MB13=" + mb13 + " | MB60=" + mb60 + "\r\n" +
                            "Alarm Word : " + st.Sensors.AlarmWord + " | Updated: " + DateTime.Now.ToString("HH:mm:ss");
                        col = conn ? Color.FromArgb(74, 222, 128) : Color.FromArgb(56, 189, 248);
                    }
                    else
                    {
                        summary = BuildLocalStandaloneSummary(st);
                        col = Color.FromArgb(56, 189, 248);
                    }
                }
                else
                {
                    summary = BuildLocalStandaloneSummary(st);
                    col = Color.FromArgb(56, 189, 248);
                }

                if (!IsDisposed && IsHandleCreated)
                {
                    try
                    {
                        BeginInvoke((Action)delegate
                        {
                            _lblPlcLive.ForeColor = col;
                            _lblPlcLive.Text = summary;
                        });
                    }
                    catch { }
                }
            });
        }

        string BuildLocalStandaloneSummary(ParkState st)
        {
            int occ = 0;
            foreach (var sp in st.Spaces) if (sp.Status == "OCCUPIED") occ++;
            return
                "● STANDALONE LOCAL ENGINE ACTIVE (NO VNC)\r\n" +
                "VNC Needed : DISABLED (Direct Execution)\r\n" +
                "Mode       : " + (st.Sensors.ManualMode ? "MANUAL" : "AUTO") + " | E-Stop: " + (st.EmergencyStop ? "ACTIVE" : "CLEAR") + "\r\n" +
                "Bays       : " + occ + " / " + st.Spaces.Count + " Occupied\r\n" +
                "PLC Target : " + _shell.Settings.PlcIp + ":" + _shell.Settings.PlcPort + " (" + _shell.Settings.Protocol + ")\r\n" +
                "Updated    : " + DateTime.Now.ToString("HH:mm:ss");
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
    }
}
