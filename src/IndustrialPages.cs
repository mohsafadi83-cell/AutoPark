using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Threading;
using System.Windows.Forms;

namespace AutoPark
{
    /// <summary>
    /// Clean, soft geometric circular LED indicator lamp (no verbose text inside).
    /// </summary>
    class LampIndicator : Panel
    {
        Color _lampColor = Color.FromArgb(203, 213, 225);
        Color _ringColor = Color.FromArgb(148, 163, 184);
        bool _isOn = false;
        int _diameter = 18;

        public LampIndicator(int diameter = 18)
        {
            _diameter = diameter;
            DoubleBuffered = true;
            BackColor = Color.Transparent;
            Dock = DockStyle.Fill;
            Margin = new Padding(2);
        }

        public void SetState(bool on, Color onColor, Color offColor, Color offRing)
        {
            bool changed = (_isOn != on) || (_lampColor != (on ? onColor : offColor));
            _isOn = on;
            _lampColor = on ? onColor : offColor;
            _ringColor = on ? ControlPaint.Dark(onColor, 0.15f) : offRing;
            if (changed) Invalidate();
        }

        public void SetGreen(bool on)
        {
            SetState(on, Color.FromArgb(34, 197, 94), Color.FromArgb(226, 232, 240), Color.FromArgb(148, 163, 184));
        }

        public void SetRed(bool on)
        {
            SetState(on, Color.FromArgb(239, 68, 68), Color.FromArgb(226, 232, 240), Color.FromArgb(148, 163, 184));
        }

        public void SetAmber(bool on)
        {
            SetState(on, Color.FromArgb(245, 158, 11), Color.FromArgb(226, 232, 240), Color.FromArgb(148, 163, 184));
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            int d = Math.Min(_diameter, Math.Min(Width - 6, Height - 6));
            if (d < 8) d = 8;
            int x = (Width - d) / 2;
            int y = (Height - d) / 2;

            if (_isOn)
            {
                using (var glow = new SolidBrush(Color.FromArgb(55, _lampColor)))
                    g.FillEllipse(glow, x - 3, y - 3, d + 6, d + 6);
            }
            using (var fill = new SolidBrush(_lampColor))
                g.FillEllipse(fill, x, y, d, d);
            using (var pen = new Pen(_ringColor, 1.4f))
                g.DrawEllipse(pen, x, y, d, d);
            if (_isOn)
            {
                using (var shine = new SolidBrush(Color.FromArgb(130, 255, 255, 255)))
                    g.FillEllipse(shine, x + d / 4, y + d / 5, Math.Max(3, d / 3), Math.Max(2, d / 4));
            }
        }
    }

    /// <summary>
    /// Live Sensor & Limit-Switch Monitor (Status Monitor — 4 Lanes × 3 Floors + MG_PROT + Safety Interlocks).
    /// </summary>
    class SensorMonitorPage : Panel
    {
        readonly MainForm _shell;
        readonly System.Windows.Forms.Timer _refreshTimer;
        readonly ToolTip _tips = new ToolTip();
        readonly Label _lblModeBanner;
        readonly Label _lblPhotocell;
        readonly Label _lblPhotocellOut;
        readonly Label _lblEmergency;
        readonly Label _lblFaultPhase;
        readonly Label _lblOverload;
        readonly Label _lblObstacle;
        readonly Label _lblStopper;
        readonly Label _lblLiftPos;
        readonly Label _lblMaintBanner;
        readonly Panel _maintPanel;
        readonly Label[] _rawInLeds = new Label[32];
        readonly Label _lblRawIoLine;
        readonly LampIndicator[,] _lsCells = new LampIndicator[4, 3]; // [lane 0..3, 0=BTM(P1), 1=MID(P2), 2=TOP(P3)]
        readonly LampIndicator[] _mgCells = new LampIndicator[4];
        readonly LampIndicator[] _locCells = new LampIndicator[4];
        readonly Label _lblAlarmRegs;

        public SensorMonitorPage(MainForm shell)
        {
            _shell = shell;
            BackColor = Theme.Back;
            AutoScroll = true;

            DockStyle startDock = Loc.IsArabic ? DockStyle.Right : DockStyle.Left;
            DockStyle endDock = Loc.IsArabic ? DockStyle.Left : DockStyle.Right;

            // Top Action Bar
            var topBar = new Panel { Dock = DockStyle.Top, Height = 54, Padding = new Padding(0, 2, 0, 8) };

            var btnRefresh = new ModernButton
            {
                Text = Loc.T("Refresh Sensors", "تحديث الحساسات الآن"),
                IconGlyph = Icons.Refresh,
                BaseColor = Theme.Primary,
                HoverColor = Theme.PrimaryHover
            };
            btnRefresh.Click += delegate { PollAndRender(true); };

            var btnSafeReset = new ModernButton
            {
                Text = Loc.T("Safe PLC Reset", "إعادة ضبط آمنة للـ PLC"),
                IconGlyph = Icons.Shield,
                BaseColor = Theme.Blue,
                HoverColor = Color.FromArgb(29, 78, 216),
                Enabled = shell.CurrentUser.CanAcknowledgeAlarms
            };
            btnSafeReset.Click += delegate
            {
                var st = ParkState.Instance;
                st.RecordLocalAudit("SAFE_RESET", "PLC",
                    Loc.T("Safe ParkDB.Reset pulse (Alarm Word preserved)", "نبضة ParkDB.Reset الآمنة (بدون تصفير Alarm Word)"),
                    Loc.UserDisplay(_shell.CurrentUser));
                ThreadPool.QueueUserWorkItem(delegate { st.SendRecoveryAction("SAFE_RESET"); });
                Loc.ShowMsg(
                    "Safe Reset pulse (ParkDB.Reset) has been sent to the PLC.\nNote: Alarm Word is NOT force-cleared until the physical fault is resolved.",
                    "تم إرسال نبضة إعادة الضبط الآمنة (ParkDB.Reset) إلى الـ PLC.\nملاحظة أمان: لن يتم تصفير سجل الأعطال (Alarm Word) قسرياً إلا بعد زوال السبب الفيزيائي.",
                    "Safe Reset", "إعادة ضبط آمنة",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                PollAndRender(true);
            };

            var btnRecovery = new ModernButton
            {
                Text = Loc.T("Emergency Recovery", "لوحة استعادة الطوارئ"),
                IconGlyph = Icons.Warning,
                BaseColor = Theme.Err,
                HoverColor = Color.FromArgb(185, 28, 28),
                Enabled = shell.CurrentUser.CanAcknowledgeAlarms
            };
            btnRecovery.Click += delegate
            {
                using (var dlg = new EmergencyRecoveryDialog(_shell))
                {
                    dlg.ShowDialog(_shell);
                }
                RenderSensors();
            };

            _lblModeBanner = Theme.Label(Loc.T("Reading PLC sensors...", "جاري قراءة الحساسات..."), Theme.Semi(10f), Theme.Muted);
            _lblModeBanner.Dock = DockStyle.Fill;

            topBar.Controls.Add(_lblModeBanner);
            topBar.Controls.Add(Theme.Holder(btnRefresh, startDock, 170, new Padding(6, 2, 6, 2)));
            topBar.Controls.Add(Theme.Holder(btnSafeReset, startDock, 195, new Padding(6, 2, 6, 2)));
            topBar.Controls.Add(Theme.Holder(btnRecovery, startDock, 195, new Padding(0, 2, 6, 2)));

            // Maintenance Due Banner
            _maintPanel = new Panel
            {
                Dock = DockStyle.Top,
                Height = 48,
                BackColor = Theme.AmberSoft,
                Padding = new Padding(14, 6, 14, 6),
                Visible = false
            };
            _lblMaintBanner = Theme.Label(
                Loc.T("⚠ Warning: Periodic Maintenance Due (ParkDB.Period_Maintanence = ON)",
                      "⚠ تنبيه: حان موعد الصيانة الدورية المجدولة للماكنة (ParkDB.Period_Maintanence = ON)"),
                Theme.Bold(10.5f), Theme.Amber);
            _lblMaintBanner.Dock = DockStyle.Fill;
            var btnResetMaint = new ModernButton
            {
                Text = Loc.T("Reset Maintenance Counter", "تصفير عداد الصيانة الدورية"),
                BaseColor = Theme.Amber,
                HoverColor = Color.FromArgb(180, 83, 9),
                Enabled = shell.CurrentUser.CanMaintenance
            };
            btnResetMaint.Click += delegate
            {
                var ok = Loc.ShowMsg(
                    "Confirm that periodic machine maintenance has been completed and start a new maintenance period (New_Maintanence_period)?",
                    "هل تم تنفيذ جميع فحوصات الصيانة الدورية للماكنة وتريد بدء فترة صيانة جديدة (New_Maintanence_period)؟",
                    "Confirm Periodic Maintenance", "تأكيد الصيانة الدورية",
                    MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2);
                if (ok != DialogResult.Yes) return;
                ParkState.Instance.Sensors.MaintenanceDue = false;
                ParkState.Instance.RecordLocalAudit("MAINT_RESET", "PLC",
                    Loc.T("Reset periodic maintenance counter", "تصفير عداد الصيانة الدورية (New_Maintanence_period)"),
                    Loc.UserDisplay(_shell.CurrentUser));
                ThreadPool.QueueUserWorkItem(delegate { ParkState.Instance.SendManualControl("maintenance_reset_tag", true); });
                RenderSensors();
            };
            _maintPanel.Controls.Add(_lblMaintBanner);
            _maintPanel.Controls.Add(Theme.Holder(btnResetMaint, endDock, 220, new Padding(0, 2, 0, 2)));

            // Safety & Sensor Indicators Strip (2 rows × 4 cards = 8 live verified PLC sensors)
            var safetyGrid = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                Height = 168,
                ColumnCount = 4,
                RowCount = 2,
                Padding = new Padding(0, 6, 0, 8)
            };
            for (int i = 0; i < 4; i++) safetyGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 25f));
            safetyGrid.RowStyles.Add(new RowStyle(SizeType.Absolute, 76f));
            safetyGrid.RowStyles.Add(new RowStyle(SizeType.Absolute, 76f));

            _lblPhotocell = MakeSafetyBadge(safetyGrid, 0, 0, Loc.T("Photocell Inside (DB1,X0.7)", "حساس داخلي (DB1,X0.7)"));
            _lblPhotocellOut = MakeSafetyBadge(safetyGrid, 1, 0, Loc.T("Photocell Outside (DB1,X1.0)", "حساس خارجي (DB1,X1.0)"));
            _lblEmergency = MakeSafetyBadge(safetyGrid, 2, 0, Loc.T("Emergency Stop (M50.0 / DB1,X0.1)", "مفتاح الطوارئ (M50.0)"));
            _lblFaultPhase = MakeSafetyBadge(safetyGrid, 3, 0, Loc.T("PLC Fault / Phase (DB1,X0.0/0.2)", "أعطال / فاز (DB1,X0.0/0.2)"));
            _lblOverload = MakeSafetyBadge(safetyGrid, 0, 1, Loc.T("Pump & Comp O.L (M50.1/M50.2)", "حمل المضخة والضاغط (M50.1/2)"));
            _lblObstacle = MakeSafetyBadge(safetyGrid, 1, 1, Loc.T("Lift Obstacle (M3.3)", "عائق المصعد (M3.3)"));
            _lblStopper = MakeSafetyBadge(safetyGrid, 2, 1, Loc.T("Mechanical Stopper (M50.4)", "حالة Stopper (M50.4)"));
            _lblLiftPos = MakeSafetyBadge(safetyGrid, 3, 1, Loc.T("Lift Position (M50.3 / M50.5)", "تموضع المصعد (M50.3/5)"));

            // Live Physical Digital Inputs Strip (4 rows × 8 columns = I0.0–I0.7, I1.0–I1.7, I2.0–I2.7, I3.0–I3.7)
            var rawIoCard = new Card { Dock = DockStyle.Top, Height = 236, Padding = new Padding(14, 10, 14, 10) };
            _lblRawIoLine = Theme.Label(
                Loc.T("Live Physical PLC Digital Inputs (I0.0–I3.7) — IB0=— IB1=— IB2=— IB3=—",
                      "مداخل الحساسات الفيزيائية الحية من الـ PLC (I0.0–I3.7) — IB0=— IB1=— IB2=— IB3=—"),
                Theme.Bold(9.5f), Theme.Primary);
            _lblRawIoLine.UseMnemonic = false;
            _lblRawIoLine.Dock = DockStyle.Top;
            _lblRawIoLine.Height = 24;

            var rawGrid = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 8,
                RowCount = 4,
                Padding = new Padding(0, 6, 0, 0),
                RightToLeft = RightToLeft.No
            };
            for (int c = 0; c < 8; c++) rawGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 12.5f));
            for (int r = 0; r < 4; r++) rawGrid.RowStyles.Add(new RowStyle(SizeType.Absolute, 46f));
            for (int i = 0; i < 32; i++)
            {
                string nm = InputName(i);
                var led = new Label
                {
                    Text = "I" + (i / 8) + "." + (i % 8) + "\n" + nm,
                    Font = new Font("Segoe UI", 7.8f, FontStyle.Bold),
                    TextAlign = ContentAlignment.MiddleCenter,
                    Dock = DockStyle.Fill,
                    Margin = new Padding(3, 3, 3, 3),
                    BackColor = Theme.Back,
                    ForeColor = Theme.Muted,
                    BorderStyle = BorderStyle.FixedSingle,
                    UseMnemonic = false
                };
                _rawInLeds[i] = led;
                rawGrid.Controls.Add(led, i % 8, i / 8);
            }
            rawIoCard.Controls.Add(rawGrid);
            rawIoCard.Controls.Add(_lblRawIoLine);

            // Main Limit Switch Matrix Card (explicit height + absolute row heights so rows never overlap)
            var matrixCard = new Card { Dock = DockStyle.Top, Height = 398, Padding = new Padding(18, 12, 18, 12) };
            var matrixTitle = Theme.Label(
                Loc.T("Floor Limit Switches Matrix (TOP=P3 / MID=P2 / BTM=P1) & Mechanical Protection (MG_PROT):",
                      "مصفوفة حساسات حدود الطوابق (Limit Switches: TOP=P3 / MID=P2 / BTM=P1) والحماية الميكانيكية (MG_PROT):"),
                Theme.Bold(10.5f), Theme.Ink);
            matrixTitle.UseMnemonic = false;
            matrixTitle.Dock = DockStyle.Top;
            matrixTitle.Height = 30;

            var tbl = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 5,
                RowCount = 6,
                Padding = new Padding(4, 8, 4, 8)
            };
            tbl.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 235f));
            for (int c = 1; c <= 4; c++)
                tbl.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 25f));
            tbl.RowStyles.Add(new RowStyle(SizeType.Absolute, 42f));
            for (int r = 1; r < 6; r++)
                tbl.RowStyles.Add(new RowStyle(SizeType.Absolute, 52f));

            tbl.Controls.Add(MakeHeaderCell(Loc.T("Sensor / Floor", "الحساس / الطابق")), 0, 0);
            for (int lane = 1; lane <= 4; lane++)
                tbl.Controls.Add(MakeHeaderCell(Loc.T("Lane " + lane, "المسار " + lane + " (Lane " + lane + ")")), lane, 0);

            tbl.Controls.Add(MakeRowTitle(Loc.T("Top Floor P3 (LS_TOP)", "الطابق العلوي P3 (LS_TOP)")), 0, 1);
            tbl.Controls.Add(MakeRowTitle(Loc.T("Mid Floor P2 (LS_MID)", "الطابق الأوسط P2 (LS_MID)")), 0, 2);
            tbl.Controls.Add(MakeRowTitle(Loc.T("Bottom Floor P1 (LS_BTM)", "الطابق السفلي P1 (LS_BTM)")), 0, 3);
            tbl.Controls.Add(MakeRowTitle(Loc.T("Mechanical Protection (MG_PROT)", "الحماية الميكانيكية (MG_PROT)")), 0, 4);
            tbl.Controls.Add(MakeRowTitle(Loc.T("Location Check Trigger (M3.4–3.7)", "إشارة فحص الموقع (M3.4–3.7)")), 0, 5);

            for (int lane = 0; lane < 4; lane++)
            {
                _lsCells[lane, 2] = MakeLampCell("PL" + (lane + 1) + "_LS_TOP");
                _lsCells[lane, 1] = MakeLampCell("PL" + (lane + 1) + "_LS_MID");
                _lsCells[lane, 0] = MakeLampCell("PL" + (lane + 1) + "_LS_BTM");
                _mgCells[lane] = MakeLampCell("PL" + (lane + 1) + "_MG_PROT");
                _locCells[lane] = MakeLampCell("Lane" + (lane + 1) + "_check");

                tbl.Controls.Add(_lsCells[lane, 2], lane + 1, 1);
                tbl.Controls.Add(_lsCells[lane, 1], lane + 1, 2);
                tbl.Controls.Add(_lsCells[lane, 0], lane + 1, 3);
                tbl.Controls.Add(_mgCells[lane], lane + 1, 4);
                tbl.Controls.Add(_locCells[lane], lane + 1, 5);
            }

            _lblAlarmRegs = Theme.Label("Alarm Word: 0 | Alarm Section: 0", Theme.F(9.5f), Theme.Muted);
            _lblAlarmRegs.Dock = DockStyle.Bottom;
            _lblAlarmRegs.Height = 28;

            matrixCard.Controls.Add(tbl);
            matrixCard.Controls.Add(matrixTitle);
            matrixCard.Controls.Add(_lblAlarmRegs);

            var gap1 = new Panel { Dock = DockStyle.Top, Height = 10, BackColor = Color.Transparent };
            var gap2 = new Panel { Dock = DockStyle.Top, Height = 10, BackColor = Color.Transparent };
            var gapBottom = new Panel { Dock = DockStyle.Top, Height = 16, BackColor = Color.Transparent };

            Controls.Add(gapBottom);
            Controls.Add(matrixCard);
            Controls.Add(gap2);
            Controls.Add(rawIoCard);
            Controls.Add(gap1);
            Controls.Add(safetyGrid);
            Controls.Add(_maintPanel);
            Controls.Add(topBar);

            _refreshTimer = new System.Windows.Forms.Timer { Interval = 1200 };
            _refreshTimer.Tick += delegate { PollAndRender(false); };
            _refreshTimer.Start();

            Disposed += delegate { _refreshTimer.Stop(); };
            RenderSensors();
            PollAndRender(true);
        }

        /// <summary>Verified TIA Portal "PLC tags → Inputs [24]" names for I0.0..I3.7 (bit index = byte*8+bit).</summary>
        static string InputName(int idx)
        {
            switch (idx)
            {
                case 0: return "MAIN_PF";
                case 1: return "PCELL_IN";
                case 2: return "OUT_PCELL";
                case 3: return "PUMP_OL";
                case 4: return "COMP_OL";
                case 5: return "SPARE2";
                case 6: return "SPARE3";
                case 7: return "EMERGENCY";
                case 16: return "PL1_MG";
                case 17: return "PL2_MG";
                case 18: return "PL3_MG";
                case 19: return "PL4_MG";
                case 20: return "PL1_BTM";
                case 21: return "PL2_BTM";
                case 22: return "PL3_BTM";
                case 23: return "PL4_BTM";
                case 24: return "PL1_TOP";
                case 25: return "PL2_TOP";
                case 26: return "PL3_TOP";
                case 27: return "PL4_TOP";
                case 28: return "PL1_MID";
                case 29: return "PL2_MID";
                case 30: return "PL3_MID";
                case 31: return "PL4_MID";
                default: return "(unused)";
            }
        }

        Label MakeSafetyBadge(TableLayoutPanel parent, int col, int row, string titleText)
        {
            var card = new Card { Dock = DockStyle.Fill, Margin = new Padding(4, 4, 4, 4), Padding = new Padding(10, 6, 10, 6) };
            var t = Theme.Label(titleText, Theme.Semi(8.4f), Theme.Muted);
            t.UseMnemonic = false;
            t.Dock = DockStyle.Top;
            t.Height = 20;
            var v = Theme.Label("—", Theme.Bold(9.5f), Theme.Ok);
            v.UseMnemonic = false;
            v.Dock = DockStyle.Fill;
            card.Controls.Add(v);
            card.Controls.Add(t);
            parent.Controls.Add(card, col, row);
            return v;
        }

        Label MakeHeaderCell(string text)
        {
            var l = Theme.Label(text, Theme.Bold(10f), Theme.Primary);
            l.Dock = DockStyle.Fill;
            l.TextAlign = ContentAlignment.MiddleCenter;
            l.BackColor = Theme.PrimarySoft;
            l.Margin = new Padding(4, 4, 4, 4);
            return l;
        }

        Label MakeRowTitle(string text)
        {
            var l = Theme.Label(text, Theme.Semi(9.5f), Theme.Ink);
            l.Dock = DockStyle.Fill;
            l.TextAlign = Theme.AlignStart;
            l.Padding = new Padding(8, 0, 8, 0);
            l.BackColor = Theme.Back;
            l.Margin = new Padding(4, 6, 4, 6);
            return l;
        }

        LampIndicator MakeLampCell(string tooltipTag)
        {
            var lamp = new LampIndicator(20);
            lamp.BackColor = Color.FromArgb(248, 250, 252);
            lamp.Margin = new Padding(4, 4, 4, 4);
            _tips.SetToolTip(lamp, tooltipTag);
            return lamp;
        }

        void PollAndRender(bool immediate)
        {
            if (IsDisposed) return;
            ThreadPool.QueueUserWorkItem(delegate
            {
                ParkState.Instance.PullSensorsFromBackend();
                if (!IsDisposed && IsHandleCreated)
                {
                    try { BeginInvoke((Action)RenderSensors); } catch { }
                }
            });
            if (immediate) RenderSensors();
        }

        void RenderSensors()
        {
            if (IsDisposed) return;
            var st = ParkState.Instance;
            var s = st.Sensors;

            _lblModeBanner.Text = s.LiveConnected
                ? Loc.T("🟢 Live PLC S7-1200 Connection (Last Sync: " + s.LastSyncTime + ")",
                        "🟢 اتصال مباشر مع PLC S7-1200 (تحديث حي — آخر قراءة: " + s.LastSyncTime + ")")
                : Loc.T("🟡 Simulation / Waiting for PLC (Last Sync: " + s.LastSyncTime + ")",
                        "🟡 وضع المحاكاة / انتظار اتصال الـ PLC (آخر تحديث: " + s.LastSyncTime + ")");
            _lblModeBanner.ForeColor = s.LiveConnected ? Theme.Ok : Theme.Amber;

            _maintPanel.Visible = s.MaintenanceDue;

            _lblPhotocell.Text = s.PhotocellClear ? Loc.T("🟢 Clear (1)", "🟢 فارغ (1)") : Loc.T("🔴 Blocked (0)!", "🔴 مقطوع (0)!");
            _lblPhotocell.ForeColor = s.PhotocellClear ? Theme.Ok : Theme.Err;

            _lblPhotocellOut.Text = s.PcellOutsideClear ? Loc.T("🟢 Clear (1)", "🟢 فارغ (1)") : Loc.T("🔴 Blocked (0)!", "🔴 مقطوع (0)!");
            _lblPhotocellOut.ForeColor = s.PcellOutsideClear ? Theme.Ok : Theme.Err;

            bool eStop = st.EmergencyStop || s.EmergencyPhysical;
            _lblEmergency.Text = eStop ? Loc.T("🔴 ACTIVE", "🔴 طوارئ مفعّل") : Loc.T("🟢 Normal", "🟢 سليم");
            _lblEmergency.ForeColor = eStop ? Theme.Err : Theme.Ok;

            bool faultOrPhase = s.FaultDb || s.PhaseFail;
            _lblFaultPhase.Text = faultOrPhase
                ? (s.PhaseFail ? Loc.T("🔴 Phase Fail!", "🔴 انقطاع فاز!") : Loc.T("🔴 PLC Fault!", "🔴 عطل عام!"))
                : Loc.T("🟢 Healthy", "🟢 سليم");
            _lblFaultPhase.ForeColor = faultOrPhase ? Theme.Err : Theme.Ok;

            bool ol = s.PumpOverload || s.CompressorOverload;
            _lblOverload.Text = ol
                ? (s.PumpOverload ? Loc.T("🔴 Pump O.L!", "🔴 حمل مضخة!") : Loc.T("🔴 Comp O.L!", "🔴 حمل ضاغط!"))
                : Loc.T("🟢 Normal", "🟢 سليم");
            _lblOverload.ForeColor = ol ? Theme.Err : Theme.Ok;

            _lblObstacle.Text = s.ObstacleExist ? Loc.T("🔴 Obstacle!", "🔴 عائق مرصود!") : Loc.T("🟢 Clear", "🟢 لا يوجد عائق");
            _lblObstacle.ForeColor = s.ObstacleExist ? Theme.Err : Theme.Ok;

            _lblStopper.Text = s.StopperFault ? Loc.T("🔴 Stopper Fault!", "🔴 عطل Stopper!") : Loc.T("🟢 Energized / OK", "🟢 سليم ومؤمّن");
            _lblStopper.ForeColor = s.StopperFault ? Theme.Err : Theme.Ok;

            _lblLiftPos.Text = (s.LiftInvalidPos || s.ErrorInPosition) ? Loc.T("🔴 Invalid Position!", "🔴 موضع غير صالح!") : Loc.T("🟢 Valid Position", "🟢 موضع دقيق");
            _lblLiftPos.ForeColor = (s.LiftInvalidPos || s.ErrorInPosition) ? Theme.Err : Theme.Ok;

            // Live Physical Digital Inputs (I0.0 – I3.7 from IB0..IB3)
            if (s.HasRawIo)
            {
                _lblRawIoLine.Text = string.Format(
                    Loc.T("Live Physical PLC Digital Inputs (I0.0–I3.7) — IB0={0}  IB1={1}  IB2={2}  IB3={3}   |   QB0={4}  QB1={5}  QB2={6}  QB3={7}",
                          "مداخل الحساسات الفيزيائية الحية من الـ PLC (I0.0–I3.7) — IB0={0}  IB1={1}  IB2={2}  IB3={3}   |   QB0={4}  QB1={5}  QB2={6}  QB3={7}"),
                    s.RawInputs[0], s.RawInputs[1], s.RawInputs[2], s.RawInputs[3],
                    s.RawOutputs[0], s.RawOutputs[1], s.RawOutputs[2], s.RawOutputs[3]);
                for (int b = 0; b < 4; b++)
                {
                    int val = s.RawInputs[b] & 0xFF;
                    for (int bit = 0; bit < 8; bit++)
                    {
                        bool on = ((val >> bit) & 1) != 0;
                        var led = _rawInLeds[b * 8 + bit];
                        led.BackColor = on ? Theme.OkSoft : Theme.Back;
                        led.ForeColor = on ? Theme.Ok : Theme.Muted;
                    }
                }
            }

            for (int lane = 0; lane < 4; lane++)
            {
                bool lsMapped = s.LsMapped[lane];
                for (int lv = 0; lv < 3; lv++)
                {
                    var cell = _lsCells[lane, lv];
                    if (s.LiveConnected && !lsMapped)
                    {
                        cell.SetAmber(true);
                        cell.BackColor = Theme.AmberSoft;
                    }
                    else
                    {
                        bool on = s.LimitSwitches[lane, lv];
                        cell.SetGreen(on);
                        cell.BackColor = on ? Color.FromArgb(236, 253, 245) : Color.FromArgb(248, 250, 252);
                    }
                }

                if (s.LiveConnected && !s.MgProtMapped[lane])
                {
                    _mgCells[lane].SetAmber(true);
                    _mgCells[lane].BackColor = Theme.AmberSoft;
                }
                else
                {
                    bool mg = s.MgProt[lane];
                    _mgCells[lane].SetRed(mg);
                    _mgCells[lane].BackColor = mg ? Theme.ErrSoft : Color.FromArgb(248, 250, 252);
                }

                bool loc = s.CheckLocation[lane];
                _locCells[lane].SetGreen(loc);
                _locCells[lane].BackColor = loc ? Color.FromArgb(236, 253, 245) : Color.FromArgb(248, 250, 252);
            }

            _lblAlarmRegs.Text = string.Format(
                Loc.T("PLC Registers — Alarm Word: {0} | Alarm Section: {1} | Mode: {2}",
                      "سجلات الـ PLC — Alarm Word: {0} | Alarm Section: {1} | الوضع: {2}"),
                s.AlarmWord,
                s.AlarmSection,
                s.ManualMode ? Loc.T("Manual", "يدوي") : Loc.T("Auto", "تلقائي")
            );
        }
    }

    /// <summary>
    /// Modern Geometric Live Status Monitor (upgraded reference of legacy Siemens KTP400 Status Monitor Screen).
    /// Always visible alongside Manual controls (zero scrolling) and tracks both Manual & Automatic live states.
    /// </summary>
    class LiveStatusMonitorCard : Card
    {
        readonly MainForm _shell;
        readonly System.Windows.Forms.Timer _timer;
        readonly ToolTip _tips = new ToolTip();
        readonly LampIndicator _lampI01;
        readonly LampIndicator _lampInOut;
        readonly LampIndicator _lampI02;
        readonly Label _lblPhotoBanner;
        readonly Label _lblModePill;
        readonly Label _lblAutoTrack;
        readonly LampIndicator[,] _lsLamps = new LampIndicator[4, 3]; // [lane 0..3, 0=BTM, 1=MID, 2=TOP]
        readonly LampIndicator[] _mgLamps = new LampIndicator[4];
        readonly Panel[] _autoStepLeds = new Panel[13];
        readonly ModernButton _btnCancelIn;
        readonly ModernButton _btnCancelOut;
        bool _cancelInOn = false;
        bool _cancelOutOn = false;

        public LiveStatusMonitorCard(MainForm shell, Action onSoftRecoveryClick)
        {
            _shell = shell;
            Dock = DockStyle.Fill;
            Padding = new Padding(12, 10, 12, 10);
            Margin = new Padding(6);

            // Header: Title + Live Mode Pill (AUTO / MANUAL / E-STOP)
            var hdr = new Panel { Dock = DockStyle.Top, Height = 30 };
            var lblTitle = Theme.Label(
                Loc.T("📡 Live Status Monitor (Auto & Manual)", "📡 شاشة مراقبة الحالة الحية (تلقائي ويدوي)"),
                Theme.Bold(9.8f), Theme.Primary);
            lblTitle.UseMnemonic = false;
            lblTitle.Dock = DockStyle.Fill;
            _lblModePill = new Label
            {
                Text = "● AUTO",
                Font = Theme.Bold(8.8f),
                ForeColor = Theme.Ok,
                BackColor = Theme.OkSoft,
                TextAlign = ContentAlignment.MiddleCenter,
                Dock = DockStyle.Right,
                Width = 110
            };
            hdr.Controls.Add(lblTitle);
            hdr.Controls.Add(_lblModePill);

            // Photocell Top Strip (I0.1 | Banner | In+Out | I0.2) — mirrors Image 3 cleanly
            var photoBar = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                Height = 46,
                ColumnCount = 4,
                RowCount = 1,
                Padding = new Padding(0, 2, 0, 4),
                RightToLeft = RightToLeft.No
            };
            photoBar.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 52f));
            photoBar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            photoBar.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 62f));
            photoBar.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 52f));
            photoBar.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));

            _lampI01 = new LampIndicator(14);
            _tips.SetToolTip(_lampI01, "I0.1 — Photocell Inside");
            _lampInOut = new LampIndicator(14);
            _tips.SetToolTip(_lampInOut, "In + Out Photocell Combined");
            _lampI02 = new LampIndicator(14);
            _tips.SetToolTip(_lampI02, "I0.2 — Photocell Outside");

            _lblPhotoBanner = new Label
            {
                Text = Loc.T("Photocell: Entrance Clear", "حساس المدخل: المسار فارغ وآمن"),
                Font = Theme.Bold(9.0f),
                ForeColor = Theme.Ok,
                BackColor = Theme.OkSoft,
                AutoSize = false,
                TextAlign = ContentAlignment.MiddleCenter,
                Dock = DockStyle.Fill,
                Margin = new Padding(4, 3, 4, 3),
                UseMnemonic = false
            };

            photoBar.Controls.Add(WrapLabeledLamp(_lampI01, "I0.1"), 0, 0);
            photoBar.Controls.Add(_lblPhotoBanner, 1, 0);
            photoBar.Controls.Add(WrapLabeledLamp(_lampInOut, "In+Out"), 2, 0);
            photoBar.Controls.Add(WrapLabeledLamp(_lampI02, "I0.2"), 3, 0);

            // Center Geometric Lamp Matrix (TOP / MID / BTM + MG_PROT across Lanes 1..4 — pure indicator lamps, no text!)
            var lampGrid = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                Height = 148,
                ColumnCount = 5,
                RowCount = 5,
                Padding = new Padding(0, 4, 0, 4),
                RightToLeft = RightToLeft.No
            };
            lampGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 76f));
            for (int c = 1; c <= 4; c++) lampGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 25f));
            lampGrid.RowStyles.Add(new RowStyle(SizeType.Absolute, 22f));
            for (int r = 1; r <= 4; r++) lampGrid.RowStyles.Add(new RowStyle(SizeType.Percent, 25f));

            lampGrid.Controls.Add(MakeMiniHdr(""), 0, 0);
            for (int lane = 1; lane <= 4; lane++) lampGrid.Controls.Add(MakeMiniHdr("L" + lane), lane, 0);

            lampGrid.Controls.Add(MakeMiniRow("TOP (P3)"), 0, 1);
            lampGrid.Controls.Add(MakeMiniRow("MID (P2)"), 0, 2);
            lampGrid.Controls.Add(MakeMiniRow("BTM (P1)"), 0, 3);
            lampGrid.Controls.Add(MakeMiniRow("MG_PROT"), 0, 4);

            for (int lane = 0; lane < 4; lane++)
            {
                _lsLamps[lane, 2] = MakeCleanLamp("PL" + (lane + 1) + "_LS_TOP");
                _lsLamps[lane, 1] = MakeCleanLamp("PL" + (lane + 1) + "_LS_MID");
                _lsLamps[lane, 0] = MakeCleanLamp("PL" + (lane + 1) + "_LS_BTM");
                _mgLamps[lane] = MakeCleanLamp("PL" + (lane + 1) + "_MG_PROT");

                lampGrid.Controls.Add(_lsLamps[lane, 2], lane + 1, 1);
                lampGrid.Controls.Add(_lsLamps[lane, 1], lane + 1, 2);
                lampGrid.Controls.Add(_lsLamps[lane, 0], lane + 1, 3);
                lampGrid.Controls.Add(_mgLamps[lane], lane + 1, 4);
            }

            // Live Automatic & Manual Tracking Strip
            _lblAutoTrack = Theme.Label(
                Loc.T("Auto/Manual Live: Waiting for PLC telemetry...", "الحالة الحية: بانتظار بيانات الـ PLC..."),
                Theme.Semi(8.6f), Theme.Ink);
            _lblAutoTrack.Dock = DockStyle.Top;
            _lblAutoTrack.Height = 22;

            // Automatic Mode Steps 1..13 LEDs (modern compact version of Image 3 bottom bar)
            var stepsTitle = Theme.Label(
                Loc.T("Automatic Mode Steps (1–13):", "خطوات الوضع التلقائي (1–13):"),
                Theme.Semi(8.2f), Theme.Muted);
            stepsTitle.Dock = DockStyle.Top;
            stepsTitle.Height = 16;

            var stepsRow = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                Height = 34,
                ColumnCount = 13,
                RowCount = 1,
                Padding = new Padding(0, 2, 0, 2),
                RightToLeft = RightToLeft.No
            };
            for (int i = 0; i < 13; i++)
            {
                stepsRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f / 13f));
                var box = new Panel
                {
                    Dock = DockStyle.Fill,
                    Margin = new Padding(2),
                    BackColor = Color.FromArgb(226, 232, 240)
                };
                var num = new Label
                {
                    Text = (i + 1).ToString(),
                    Font = Theme.Bold(7.5f),
                    ForeColor = Theme.Ink,
                    Dock = DockStyle.Fill,
                    TextAlign = ContentAlignment.MiddleCenter
                };
                box.Controls.Add(num);
                _autoStepLeds[i] = box;
                stepsRow.Controls.Add(box, i, 0);
            }

            // Bottom Quick Action Row: Cancel PhotoCell In | Cancel PhotoCell Out | Safe Reset | Soft Recovery
            var quickRow = new TableLayoutPanel
            {
                Dock = DockStyle.Bottom,
                Height = 36,
                ColumnCount = 4,
                RowCount = 1,
                Padding = new Padding(0, 4, 0, 0)
            };
            for (int c = 0; c < 4; c++) quickRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 25f));

            _btnCancelIn = new ModernButton
            {
                Text = Loc.T("○ Cancel Inside Sensor", "○ إلغاء الحساس الداخلي"),
                BaseColor = Color.FromArgb(71, 85, 105),
                HoverColor = Color.FromArgb(51, 65, 85),
                Dock = DockStyle.Fill,
                Margin = new Padding(2, 0, 2, 0)
            };
            _tips.SetToolTip(_btnCancelIn, "PLC %M6.1 — cancel_inside_sensor_tag");
            _btnCancelIn.Click += delegate { TogglePhotocellBypass(true); };

            _btnCancelOut = new ModernButton
            {
                Text = Loc.T("○ Cancel Outside Sensor", "○ إلغاء الحساس الخارجي"),
                BaseColor = Color.FromArgb(71, 85, 105),
                HoverColor = Color.FromArgb(51, 65, 85),
                Dock = DockStyle.Fill,
                Margin = new Padding(2, 0, 2, 0)
            };
            _tips.SetToolTip(_btnCancelOut, "PLC %M6.2 — cancel_outside_sensor_tag");
            _btnCancelOut.Click += delegate { TogglePhotocellBypass(false); };

            var btnReset = new ModernButton
            {
                Text = Loc.T("Safe Reset", "إعادة ضبط"),
                BaseColor = Theme.Blue,
                HoverColor = Color.FromArgb(29, 78, 216),
                Dock = DockStyle.Fill,
                Margin = new Padding(2, 0, 2, 0)
            };
            btnReset.Click += delegate
            {
                ThreadPool.QueueUserWorkItem(delegate { ParkState.Instance.SendRecoveryAction("SAFE_RESET"); });
                _lblAutoTrack.Text = Loc.T("✅ Safe PLC Reset pulse (ParkDB.Reset) sent.", "✅ تم إرسال نبضة إعادة الضبط الآمنة.");
            };

            var btnSoftRec = new ModernButton
            {
                Text = Loc.T("🔄 Soft Recover", "🔄 إنعاش PLC"),
                BaseColor = Theme.Amber,
                HoverColor = Color.FromArgb(180, 83, 9),
                Dock = DockStyle.Fill,
                Margin = new Padding(2, 0, 2, 0)
            };
            btnSoftRec.Click += delegate { if (onSoftRecoveryClick != null) onSoftRecoveryClick(); };

            quickRow.Controls.Add(_btnCancelIn, 0, 0);
            quickRow.Controls.Add(_btnCancelOut, 1, 0);
            quickRow.Controls.Add(btnReset, 2, 0);
            quickRow.Controls.Add(btnSoftRec, 3, 0);

            Controls.Add(quickRow);
            Controls.Add(stepsRow);
            Controls.Add(stepsTitle);
            Controls.Add(_lblAutoTrack);
            Controls.Add(lampGrid);
            Controls.Add(photoBar);
            Controls.Add(hdr);

            _timer = new System.Windows.Forms.Timer { Interval = 1000 };
            _timer.Tick += delegate { PollAndUpdate(); };
            _timer.Start();
            Disposed += delegate { _timer.Stop(); };
            RenderNow();
        }

        Panel WrapLabeledLamp(LampIndicator lamp, string text)
        {
            var p = new Panel { Dock = DockStyle.Fill, Margin = new Padding(1) };
            var lbl = new Label
            {
                Text = text,
                Font = Theme.Bold(7.2f),
                ForeColor = Theme.Muted,
                Dock = DockStyle.Bottom,
                Height = 13,
                TextAlign = ContentAlignment.MiddleCenter
            };
            p.Controls.Add(lamp);
            p.Controls.Add(lbl);
            return p;
        }

        LampIndicator MakeCleanLamp(string tip)
        {
            var l = new LampIndicator(18);
            l.BackColor = Color.FromArgb(248, 250, 252);
            l.Margin = new Padding(3, 2, 3, 2);
            _tips.SetToolTip(l, tip);
            return l;
        }

        Label MakeMiniHdr(string text)
        {
            return new Label
            {
                Text = text,
                Font = Theme.Bold(8.5f),
                ForeColor = Theme.Primary,
                BackColor = Theme.PrimarySoft,
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleCenter,
                Margin = new Padding(3, 1, 3, 1)
            };
        }

        Label MakeMiniRow(string text)
        {
            return new Label
            {
                Text = text,
                Font = Theme.Bold(8.2f),
                ForeColor = Theme.Ink,
                BackColor = Theme.Back,
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleLeft,
                Padding = new Padding(4, 0, 0, 0),
                Margin = new Padding(2)
            };
        }

        void TogglePhotocellBypass(bool inside)
        {
            bool next = inside ? !_cancelInOn : !_cancelOutOn;
            string key = inside ? "cancel_inside_sensor_tag" : "cancel_outside_sensor_tag";
            string plcAddr = inside ? "M6.1" : "M6.2";
            if (next)
            {
                var ok = Loc.ShowMsg(
                    "Confirm linking & activating " + (inside ? "Cancel Inside Sensor (%M6.1)" : "Cancel Outside Sensor (%M6.2)") + " on the PLC?\nUse only under supervised operation.",
                    "تأكيد تفعيل " + (inside ? "إلغاء الحساس الداخلي (%M6.1)" : "إلغاء الحساس الخارجي (%M6.2)") + " على لوحة الـ PLC؟\nيُستخدم تحت إشراف فقط.",
                    "PLC Sensor Override", "تجاوز حساس الـ PLC",
                    MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2);
                if (ok != DialogResult.Yes) return;
            }
            if (inside)
            {
                _cancelInOn = next;
                _btnCancelIn.BaseColor = next ? Theme.Amber : Color.FromArgb(71, 85, 105);
                _btnCancelIn.Text = next
                    ? Loc.T("● Cancel Inside Sensor", "● إلغاء الحساس الداخلي")
                    : Loc.T("○ Cancel Inside Sensor", "○ إلغاء الحساس الداخلي");
                _btnCancelIn.Invalidate();
            }
            else
            {
                _cancelOutOn = next;
                _btnCancelOut.BaseColor = next ? Theme.Amber : Color.FromArgb(71, 85, 105);
                _btnCancelOut.Text = next
                    ? Loc.T("● Cancel Outside Sensor", "● إلغاء الحساس الخارجي")
                    : Loc.T("○ Cancel Outside Sensor", "○ إلغاء الحساس الخارجي");
                _btnCancelOut.Invalidate();
            }
            ParkState.Instance.RecordLocalAudit("SENSOR_BYPASS", plcAddr, key + "=" + (next ? "1" : "0"), Loc.UserDisplay(_shell.CurrentUser));
            ThreadPool.QueueUserWorkItem(delegate
            {
                // Write directly to PLC %M6.1 / %M6.2 AND sync logical key
                ParkState.Instance.SendPlcWriteBool(plcAddr, next, 0);
                ParkState.Instance.SendManualControl(key, next);
            });
        }

        void PollAndUpdate()
        {
            if (IsDisposed) return;
            ThreadPool.QueueUserWorkItem(delegate
            {
                ParkState.Instance.PullSensorsFromBackend();
                if (!IsDisposed && IsHandleCreated)
                {
                    try { BeginInvoke((Action)RenderNow); } catch { }
                }
            });
        }

        public void RenderNow()
        {
            if (IsDisposed) return;
            var s = ParkState.Instance.Sensors;

            bool estop = ParkState.Instance.EmergencyStop || s.EmergencyPhysical;
            if (estop)
            {
                _lblModePill.Text = "● E-STOP";
                _lblModePill.BackColor = Theme.ErrSoft;
                _lblModePill.ForeColor = Theme.Err;
            }
            else if (s.ManualMode)
            {
                _lblModePill.Text = "● HOME MODE";
                _lblModePill.BackColor = Theme.AmberSoft;
                _lblModePill.ForeColor = Theme.Amber;
            }
            else
            {
                _lblModePill.Text = "● AUTO";
                _lblModePill.BackColor = Theme.OkSoft;
                _lblModePill.ForeColor = Theme.Ok;
            }

            bool inBlocked = !s.PhotocellClear;
            bool outBlocked = !s.PcellOutsideClear;
            _lampI01.SetRed(inBlocked);
            _lampI02.SetRed(outBlocked);
            _lampInOut.SetRed(inBlocked || outBlocked);

            if (inBlocked || outBlocked)
            {
                _lblPhotoBanner.Text = Loc.T("⚠ Something at entrance", "⚠ يوجد جسم/مركبة عند المدخل");
                _lblPhotoBanner.BackColor = Theme.AmberSoft;
                _lblPhotoBanner.ForeColor = Theme.Amber;
            }
            else
            {
                _lblPhotoBanner.Text = Loc.T("Entrance Clear", "المدخل فارغ وآمن");
                _lblPhotoBanner.BackColor = Theme.OkSoft;
                _lblPhotoBanner.ForeColor = Theme.Ok;
            }

            for (int lane = 0; lane < 4; lane++)
            {
                for (int lv = 0; lv < 3; lv++)
                {
                    bool on = s.LimitSwitches[lane, lv];
                    _lsLamps[lane, lv].SetGreen(on);
                    _lsLamps[lane, lv].BackColor = on ? Color.FromArgb(236, 253, 245) : Color.FromArgb(248, 250, 252);
                }
                bool mg = s.MgProt[lane];
                _mgLamps[lane].SetRed(mg);
                _mgLamps[lane].BackColor = mg ? Theme.ErrSoft : Color.FromArgb(248, 250, 252);
            }

            string floors = string.Format("L1:P{0}  L2:P{1}  L3:P{2}  L4:P{3}  |  Alarms:{4}",
                s.CurrentFloor[0], s.CurrentFloor[1], s.CurrentFloor[2], s.CurrentFloor[3], s.AlarmWord);
            _lblAutoTrack.Text = (s.LiveConnected ? "🟢 " : "⚪ ") + floors;

            // Map live Automatic Mode progress onto Steps 1..13 LEDs
            int activeStep = 0;
            if (s.AutoMode)
            {
                if (s.Step2Done) activeStep = 13;
                else if (s.Step2Ok) activeStep = 11;
                else if (s.Step2Ready) activeStep = 9;
                else if (s.Step1Done) activeStep = 7;
                else if (s.Step1Ok) activeStep = 5;
                else if (s.Step1Ready) activeStep = 3;
                else activeStep = 1;
            }
            for (int i = 0; i < 13; i++)
            {
                bool lit = (activeStep > 0) && (i + 1 <= activeStep);
                bool current = (i + 1 == activeStep);
                _autoStepLeds[i].BackColor = current
                    ? Color.FromArgb(34, 197, 94)
                    : (lit ? Color.FromArgb(134, 239, 172) : Color.FromArgb(226, 232, 240));
            }
        }
    }

    /// <summary>
    /// Protected Manual & Maintenance Mode (Toggle ON/OFF controls with UP/DOWN interlock, Stop-All, and Auto-Mode safety release).
    /// </summary>
    class ManualMaintenancePage : Panel
    {
        class ToggleBtnInfo
        {
            public ModernButton Button;
            public string BaseText;
            public Color OffColor;
        }

        readonly MainForm _shell;
        readonly Label _lblStatus;
        readonly ModernButton _btnModeAuto;
        readonly ModernButton _btnModeManual;
        readonly ModernButton _btnToggleSlots;
        readonly ModernButton _btnToggleMatrix;
        readonly Panel _manualControlsHost;
        readonly Panel _slotsDrawer;
        readonly Panel _matrixDrawer;
        readonly LiveStatusMonitorCard _liveMonitor;
        readonly Dictionary<string, bool> _toggleStates = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
        readonly Dictionary<string, ToggleBtnInfo> _toggleButtons = new Dictionary<string, ToggleBtnInfo>(StringComparer.OrdinalIgnoreCase);
        string _activeMomentaryKey = null;
        bool _manualEnabled = false;

        public ManualMaintenancePage(MainForm shell)
        {
            _shell = shell;
            BackColor = Theme.Back;
            AutoScroll = true;

            DockStyle startDock = Loc.IsArabic ? DockStyle.Right : DockStyle.Left;
            DockStyle endDock = Loc.IsArabic ? DockStyle.Left : DockStyle.Right;

            if (!shell.CurrentUser.CanMaintenance)
            {
                var denied = Theme.Label(
                    Loc.T("⛔ Access Denied: Manual Maintenance Mode is restricted to System Admins and Maintenance Engineers.",
                          "⛔ غير مصرح لك بالدخول إلى وضع الصيانة والتحكم اليدوي.\nهذه الشاشة مخصصة فقط لمدير النظام أو مهندس الصيانة."),
                    Theme.Bold(12.5f), Theme.Err);
                denied.Dock = DockStyle.Fill;
                denied.TextAlign = ContentAlignment.MiddleCenter;
                Controls.Add(denied);
                return;
            }

            var warnBar = new Panel
            {
                Dock = DockStyle.Top,
                Height = 50,
                BackColor = Theme.AmberSoft,
                Padding = new Padding(14, 6, 14, 6)
            };
            var lblWarn = Theme.Label(
                Loc.T("⚠ Manual Maintenance Mode (Toggle) — Click any button to turn ON, click again to turn OFF. Returning to Auto Mode or closing this screen turns all outputs OFF. All actions are audited.",
                      "⚠ وضع الصيانة والتحكم اليدوي (تبديل Toggle) — اضغط مرة للتشغيل واضغط مجدداً للإيقاف. العودة للوضع التلقائي أو إغلاق الشاشة يفصل جميع المخارج تلقائياً، وتُسجّل جميع العمليات في سجل التدقيق."),
                Theme.Bold(9.8f), Theme.Amber);
            lblWarn.Dock = DockStyle.Fill;
            warnBar.Controls.Add(lblWarn);

            var modeBar = new Panel { Dock = DockStyle.Top, Height = 52, Padding = new Padding(0, 4, 0, 4) };
            _btnModeManual = new ModernButton
            {
                Text = Loc.T("Home Mode", "وضع التموضع (Home)"),
                IconGlyph = Icons.Settings,
                BaseColor = Theme.Amber,
                HoverColor = Color.FromArgb(180, 83, 9)
            };
            _btnModeManual.Click += delegate { SetManualMode(true); };

            _btnModeAuto = new ModernButton
            {
                Text = Loc.T("Auto Mode", "الوضع التلقائي"),
                IconGlyph = Icons.Check,
                BaseColor = Theme.Ok,
                HoverColor = Color.FromArgb(21, 128, 61)
            };
            _btnModeAuto.Click += delegate { SetManualMode(false); };

            // Section 1 & Section 2 sleek show/hide toggle buttons right beside each other
            _btnToggleSlots = new ModernButton
            {
                Text = Loc.T("👁 Slot Reset", "👁 تصفير المواقف"),
                BaseColor = Color.FromArgb(71, 85, 105),
                HoverColor = Color.FromArgb(51, 65, 85)
            };
            _btnToggleSlots.Click += delegate
            {
                _slotsDrawer.Visible = !_slotsDrawer.Visible;
                _btnToggleSlots.BaseColor = _slotsDrawer.Visible ? Theme.Primary : Color.FromArgb(71, 85, 105);
            };

            _btnToggleMatrix = new ModernButton
            {
                Text = Loc.T("👁 Limit Matrix", "👁 مصفوفة الحساسات"),
                BaseColor = Color.FromArgb(71, 85, 105),
                HoverColor = Color.FromArgb(51, 65, 85)
            };
            _btnToggleMatrix.Click += delegate
            {
                _matrixDrawer.Visible = !_matrixDrawer.Visible;
                _btnToggleMatrix.BaseColor = _matrixDrawer.Visible ? Theme.Primary : Color.FromArgb(71, 85, 105);
            };

            var btnReturnHome = new ModernButton
            {
                Text = Loc.T("⬇ Home Position", "⬇ الوضع الابتدائي (Home)"),
                BaseColor = Theme.Blue,
                HoverColor = Color.FromArgb(29, 78, 216)
            };
            btnReturnHome.Click += delegate { ReturnLiftToHomeAndRestoreMode(btnReturnHome); };

            var btnStopAll = new ModernButton
            {
                Text = Loc.T("🛑 Stop All", "🛑 إيقاف الكل"),
                IconGlyph = Icons.Shield,
                BaseColor = Theme.Err,
                HoverColor = Color.FromArgb(185, 28, 28)
            };
            btnStopAll.Click += delegate { ReleaseAllOutputs(Loc.T("Immediate stop of all manual outputs", "إيقاف فوري لجميع المخارج اليدوية")); };

            _lblStatus = Theme.Label(
                Loc.T("Auto Mode — Live Status Monitor active. Enable Manual Mode for direct controls.",
                      "الوضع التلقائي — شاشة المراقبة الحية نشطة. فعّل الوضع اليدوي للتحكم المباشر."),
                Theme.Semi(9.2f), Theme.Ink);
            _lblStatus.Dock = DockStyle.Fill;

            modeBar.Controls.Add(_lblStatus);
            modeBar.Controls.Add(Theme.Holder(_btnModeManual, startDock, 130, new Padding(3, 2, 3, 2)));
            modeBar.Controls.Add(Theme.Holder(_btnModeAuto, startDock, 120, new Padding(3, 2, 3, 2)));
            modeBar.Controls.Add(Theme.Holder(_btnToggleSlots, startDock, 125, new Padding(3, 2, 3, 2)));
            modeBar.Controls.Add(Theme.Holder(_btnToggleMatrix, startDock, 130, new Padding(3, 2, 3, 2)));
            modeBar.Controls.Add(Theme.Holder(btnReturnHome, endDock, 125, new Padding(3, 2, 3, 2)));
            modeBar.Controls.Add(Theme.Holder(btnStopAll, endDock, 120, new Padding(3, 2, 3, 2)));

            // Zero-scroll main split: LEFT = Direct Manual Controls | RIGHT = Modern Geometric Live Status Monitor (Always Enabled)
            var mainWorkspace = new Panel { Dock = DockStyle.Top, Height = 380 };
            var split = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 1,
                Padding = new Padding(0, 2, 0, 2)
            };
            split.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
            split.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));

            _manualControlsHost = new Panel { Dock = DockStyle.Fill, Enabled = false };
            var holdCard = new Card { Dock = DockStyle.Fill, Padding = new Padding(14), Margin = new Padding(6) };
            var holdTitle = Theme.Label(
                Loc.T("Direct Manual Controls (Rows 1–3 Toggle | Row 4 Lanes L1–L4 Momentary + Accept_action_manual M0.4):",
                      "التحكم اليدوي المباشر (الصفوف 1–3 تبديل Toggle | الصف السفلي L1–L4 لحظي Momentary + M0.4):"),
                Theme.Bold(9.8f), Theme.Primary);
            holdTitle.Dock = DockStyle.Top;
            holdTitle.Height = 28;

            var holdGrid = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 4,
                RowCount = 4,
                Padding = new Padding(0, 8, 0, 0)
            };
            for (int c = 0; c < 4; c++) holdGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 25f));
            for (int r = 0; r < 4; r++) holdGrid.RowStyles.Add(new RowStyle(SizeType.Percent, 25f));

            holdGrid.Controls.Add(MakeToggleButton(Loc.T("⚡ Pump", "⚡ المضخة (Pump)"), "man_pump_tag", Theme.Primary), 0, 0);
            holdGrid.Controls.Add(MakeToggleButton(Loc.T("⬆ Lift UP", "⬆ صعود (UP)"), "man_up_tag", Theme.Blue), 1, 0);
            holdGrid.Controls.Add(MakeMomentaryButton(Loc.T("⬇ Lift DOWN (Hold)", "⬇ نزول (ضغط مستمر)"), "man_down_tag", Color.FromArgb(30, 64, 175)), 2, 0);
            holdGrid.Controls.Add(MakeToggleButton(Loc.T("🧱 Wall Valve", "🧱 الحاجز (Wall)"), "man_wall_tag", Theme.Purple), 3, 0);

            holdGrid.Controls.Add(MakeToggleButton(Loc.T("🔧 Cutoff Valve", "🔧 صمام القطع (Cutoff)"), "man_cutoff_tag", Theme.Ink), 0, 1);
            var btnAllowWall = MakeToggleButton(Loc.T("🔓 Allow Wall Operation", "🔓 السماح بالحاجز (Allow Wall)"), "allow_wall_tag", Theme.Amber);
            holdGrid.Controls.Add(btnAllowWall, 1, 1);
            holdGrid.SetColumnSpan(btnAllowWall, 3);

            holdGrid.Controls.Add(MakeToggleButton("🔒 Stopper S1", "man_s1_tag", Color.FromArgb(15, 118, 110)), 0, 2);
            holdGrid.Controls.Add(MakeToggleButton("🔒 Stopper S2", "man_s2_tag", Color.FromArgb(15, 118, 110)), 1, 2);
            holdGrid.Controls.Add(MakeToggleButton("🔒 Stopper S3", "man_s3_tag", Color.FromArgb(15, 118, 110)), 2, 2);
            holdGrid.Controls.Add(MakeToggleButton("🔒 Stopper S4", "man_s4_tag", Color.FromArgb(15, 118, 110)), 3, 2);

            // Lower row (Lanes L1..L4): Momentary (Press & Hold — auto-releases on MouseUp/Leave/LostFocus)
            holdGrid.Controls.Add(MakeMomentaryButton(Loc.T("🚗 Lane L1", "🚗 المسار L1"), "man_l1_tag", Color.FromArgb(51, 65, 85)), 0, 3);
            holdGrid.Controls.Add(MakeMomentaryButton(Loc.T("🚗 Lane L2 (Safe)", "🚗 المسار L2 (آمن)"), "man_l2_tag", Color.FromArgb(51, 65, 85)), 1, 3);
            holdGrid.Controls.Add(MakeMomentaryButton(Loc.T("🚗 Lane L3", "🚗 المسار L3"), "man_l3_tag", Color.FromArgb(51, 65, 85)), 2, 3);
            holdGrid.Controls.Add(MakeMomentaryButton(Loc.T("🚗 Lane L4", "🚗 المسار L4"), "man_l4_tag", Color.FromArgb(51, 65, 85)), 3, 3);

            holdCard.Controls.Add(holdGrid);
            holdCard.Controls.Add(holdTitle);
            _manualControlsHost.Controls.Add(holdCard);

            _liveMonitor = new LiveStatusMonitorCard(shell, ConfirmSoftPlcRecovery);

            split.Controls.Add(_manualControlsHost, 0, 0);
            split.Controls.Add(_liveMonitor, 1, 0);
            mainWorkspace.Controls.Add(split);

            // Section 1 Collapsible Drawer: Protected Slot Occupancy Reset (hidden by default; toggled via 👁 Slot Reset)
            _slotsDrawer = new Panel { Dock = DockStyle.Top, Height = 260, Visible = false, Padding = new Padding(0, 4, 0, 4) };
            var slotsCard = new Card { Dock = DockStyle.Fill, Padding = new Padding(14), Margin = new Padding(6) };
            var slotsTitle = Theme.Label(
                Loc.T("Protected Slot Occupancy Reset (Double Confirmation + Audit Log):",
                      "إعادة ضبط إشغال المصفات (Reset Slots — محمي بتأكيد مزدوج وسجل تدقيق):"),
                Theme.Bold(10.2f), Theme.Err);
            slotsTitle.Dock = DockStyle.Top;
            slotsTitle.Height = 28;

            var slotsGrid = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 4,
                RowCount = 3,
                Padding = new Padding(0, 6, 0, 6)
            };
            for (int c = 0; c < 4; c++) slotsGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 25f));
            for (int r = 0; r < 3; r++) slotsGrid.RowStyles.Add(new RowStyle(SizeType.Percent, 33.33f));

            for (int lane = 1; lane <= 4; lane++)
            {
                for (int r = 0; r < 3; r++)
                {
                    int p = 3 - r;
                    string code = "L" + lane + p;
                    var btnSlot = new ModernButton
                    {
                        Text = Loc.T("Reset " + code + " (P" + p + ")", "تصفير " + code + " (P" + p + ")"),
                        BaseColor = Theme.Surface,
                        HoverColor = Theme.ErrSoft,
                        ForeColor = Theme.Ink,
                        BorderColor = Theme.Border,
                        Dock = DockStyle.Fill,
                        Margin = new Padding(4)
                    };
                    string codeCopy = code;
                    btnSlot.Click += delegate { ConfirmResetSlot(codeCopy); };
                    slotsGrid.Controls.Add(btnSlot, lane - 1, r);
                }
            }

            var btnNewMaint = new ModernButton
            {
                Text = Loc.T("🛠 Reset Periodic Maintenance Counter", "🛠 تصفير عداد الصيانة الدورية (New Maintenance Period)"),
                BaseColor = Theme.Amber,
                HoverColor = Color.FromArgb(180, 83, 9),
                Dock = DockStyle.Bottom,
                Height = 38
            };
            btnNewMaint.Click += delegate { ConfirmToggleSpecial("maintenance_reset_tag", Loc.T("Reset Periodic Maintenance Counter", "تصفير عداد الصيانة الدورية")); };

            slotsCard.Controls.Add(slotsGrid);
            slotsCard.Controls.Add(slotsTitle);
            slotsCard.Controls.Add(btnNewMaint);
            _slotsDrawer.Controls.Add(slotsCard);

            // Section 2 Collapsible Drawer: Full Floor Limit Switches Matrix & I0.0-I3.7 Inputs (hidden by default; toggled via 👁 Limit Matrix)
            _matrixDrawer = new Panel { Dock = DockStyle.Top, Height = 920, Visible = false, Padding = new Padding(0, 4, 0, 4) };
            var embeddedSensors = new SensorMonitorPage(shell)
            {
                Dock = DockStyle.Fill,
                AutoScroll = false
            };
            _matrixDrawer.Controls.Add(embeddedSensors);

            Controls.Add(_matrixDrawer);
            Controls.Add(_slotsDrawer);
            Controls.Add(mainWorkspace);
            Controls.Add(modeBar);
            Controls.Add(warnBar);

            Disposed += delegate
            {
                if (_activeMomentaryKey != null)
                    ReleaseMomentary(_activeMomentaryKey, Loc.T("Maintenance screen closed", "إغلاق شاشة الصيانة"));
                if (HasAnyActiveToggle())
                    ReleaseAllOutputs(Loc.T("Maintenance screen closed", "إغلاق شاشة الصيانة"));
                if (_manualEnabled) SetManualMode(false);
            };
        }

        ModernButton MakeMomentaryButton(string text, string controlKey, Color baseCol)
        {
            var btn = new ModernButton
            {
                Text = text,
                BaseColor = baseCol,
                HoverColor = ControlPaint.Dark(baseCol, 0.08f),
                PressColor = Theme.Amber,
                ForeColor = Color.White,
                Dock = DockStyle.Fill,
                Margin = new Padding(5)
            };

            string keyCopy = controlKey;
            string textCopy = text;
            btn.MouseDown += delegate (object s, MouseEventArgs e)
            {
                if (e.Button != MouseButtons.Left || !_manualEnabled) return;
                if (ParkState.Instance.EmergencyStop)
                {
                    _lblStatus.Text = Loc.T("🔴 Manual operation blocked while Emergency Stop is active!", "🔴 ممنوع التشغيل اليدوي أثناء تفعيل إيقاف الطوارئ!");
                    _lblStatus.ForeColor = Theme.Err;
                    return;
                }
                StartMomentary(keyCopy, textCopy);
            };
            btn.MouseUp += delegate { ReleaseMomentary(keyCopy, textCopy); };
            btn.MouseLeave += delegate { if (_activeMomentaryKey == keyCopy) ReleaseMomentary(keyCopy, textCopy + Loc.T(" (pointer left)", " (خروج المؤشر)")); };
            btn.LostFocus += delegate { if (_activeMomentaryKey == keyCopy) ReleaseMomentary(keyCopy, textCopy + Loc.T(" (focus lost)", " (فقدان التركيز)")); };
            return btn;
        }

        static bool IsLaneMomentaryKey(string controlKey)
        {
            return string.Equals(controlKey, "man_l1_tag", StringComparison.OrdinalIgnoreCase)
                || string.Equals(controlKey, "man_l2_tag", StringComparison.OrdinalIgnoreCase)
                || string.Equals(controlKey, "man_l3_tag", StringComparison.OrdinalIgnoreCase)
                || string.Equals(controlKey, "man_l4_tag", StringComparison.OrdinalIgnoreCase);
        }

        void StartMomentary(string controlKey, string label)
        {
            if (_activeMomentaryKey != null && _activeMomentaryKey != controlKey)
                ReleaseMomentary(_activeMomentaryKey, Loc.T("Switching control", "تبديل التحكم"));

            bool isLane = IsLaneMomentaryKey(controlKey);
            if (string.Equals(controlKey, "man_down_tag", StringComparison.OrdinalIgnoreCase))
            {
                UpdateToggleVisual("man_up_tag", false);
                UpdateToggleVisual("man_pump_tag", false);
                UpdateToggleVisual("man_cutoff_tag", false);
            }

            _activeMomentaryKey = controlKey;
            _lblStatus.Text = isLane
                ? Loc.T("🟡 Hold Active: ", "🟡 ضغط مستمر نشط: ") + label + " (" + controlKey + " = 1 + M0.4 = 1)"
                : Loc.T("🟡 Lowering (Hold): ", "🟡 جاري النزول (ضغط مستمر): ") + label + " (man_down_tag = 1)";
            _lblStatus.ForeColor = Theme.Amber;

            string keyCopy = controlKey;
            bool laneCopy = isLane;
            ThreadPool.QueueUserWorkItem(delegate
            {
                ParkState.Instance.SendManualControl(keyCopy, true);
                if (laneCopy)
                {
                    ParkState.Instance.SendPlcWriteBool("M0.3", true, 0);
                    ParkState.Instance.SendPlcWriteBool("M0.4", true, 0);
                }
            });
        }

        void ReleaseMomentary(string controlKey, string label)
        {
            if (_activeMomentaryKey != controlKey && controlKey != null) return;
            _activeMomentaryKey = null;
            bool isLane = IsLaneMomentaryKey(controlKey);
            bool keepManualActionHigh = HasAnyActiveStopper();
            _lblStatus.Text = Loc.T("🟢 Released (0): ", "🟢 تم الإفلات (0): ") + label;
            _lblStatus.ForeColor = Theme.Ok;

            string keyCopy = controlKey;
            string lblCopy = label;
            bool keepM03 = keepManualActionHigh;
            bool laneCopy = isLane;
            ParkState.Instance.RecordLocalAudit("MANUAL_MOMENTARY", keyCopy, lblCopy, Loc.UserDisplay(_shell.CurrentUser));
            ThreadPool.QueueUserWorkItem(delegate
            {
                ParkState.Instance.SendManualControl(keyCopy, false);
                if (laneCopy)
                {
                    ParkState.Instance.SendPlcWriteBool("M0.4", false, 0);
                    ParkState.Instance.SendPlcWriteBool("M0.3", keepM03, 0);
                }
            });
        }

        void ReturnLiftToHomeAndRestoreMode(ModernButton btn)
        {
            var ps = ParkState.Instance;
            if (ps.IsPlcCommandBusy)
            {
                _lblStatus.Text = Loc.T("⏳ Another PLC command is running — please wait.", "⏳ يوجد أمر قيد التنفيذ على الـ PLC — يرجى الانتظار.");
                _lblStatus.ForeColor = Theme.Amber;
                return;
            }
            if (ps.EmergencyStop || ps.Sensors.EmergencyPhysical)
            {
                _lblStatus.Text = Loc.T("🔴 Blocked: Emergency Stop is active!", "🔴 ممنوع: إيقاف الطوارئ مفعّل!");
                _lblStatus.ForeColor = Theme.Err;
                return;
            }
            bool wasManual = _manualEnabled;
            if (_activeMomentaryKey != null || HasAnyActiveToggle())
                ReleaseAllOutputs(Loc.T("Returning lift to Home — releasing outputs", "إرجاع المصعد للوضع الابتدائي — فصل المخارج"));

            btn.Enabled = false;
            _lblStatus.Text = Loc.T("⬇ Returning lift to Home / Initial Position...", "⬇ جاري إرجاع المصعد إلى الوضع الابتدائي (Home)...");
            _lblStatus.ForeColor = Theme.Amber;

            ThreadPool.QueueUserWorkItem(delegate
            {
                string resp = ps.SendRecoveryAction("RETURN_PARK");
                if (wasManual)
                {
                    System.Threading.Thread.Sleep(600);
                    ps.SendManualControl("manual_mode_tag", true);
                }
                ps.PullSensorsFromBackend();
                if (!IsDisposed && IsHandleCreated)
                {
                    try
                    {
                        BeginInvoke((Action)delegate
                        {
                            btn.Enabled = true;
                            bool ok = string.IsNullOrEmpty(resp) || !resp.StartsWith("ERR:");
                            _lblStatus.ForeColor = ok ? Theme.Ok : Theme.Err;
                            _lblStatus.Text = ok
                                ? (wasManual
                                    ? Loc.T("✅ Lift returned to Home & Manual Mode restored.", "✅ تم إرجاع المصعد للوضع الابتدائي وإعادة الوضع اليدوي.")
                                    : Loc.T("✅ Lift returned to Home / Initial Position.", "✅ تم إرجاع المصعد للوضع الابتدائي بنجاح."))
                                : Loc.T("⚠ Return Home failed: " + resp, "⚠ تعذر إرجاع المصعد: " + resp);
                            if (_liveMonitor != null) _liveMonitor.RenderNow();
                        });
                    }
                    catch { }
                }
            });
        }

        static bool IsStopperKey(string controlKey)
        {
            return string.Equals(controlKey, "man_s1_tag", StringComparison.OrdinalIgnoreCase)
                || string.Equals(controlKey, "man_s2_tag", StringComparison.OrdinalIgnoreCase)
                || string.Equals(controlKey, "man_s3_tag", StringComparison.OrdinalIgnoreCase)
                || string.Equals(controlKey, "man_s4_tag", StringComparison.OrdinalIgnoreCase);
        }

        bool HasAnyActiveStopper()
        {
            return GetToggleState("man_s1_tag")
                || GetToggleState("man_s2_tag")
                || GetToggleState("man_s3_tag")
                || GetToggleState("man_s4_tag");
        }

        ModernButton MakeToggleButton(string text, string controlKey, Color baseCol)
        {
            var btn = new ModernButton
            {
                Text = text,
                BaseColor = baseCol,
                HoverColor = ControlPaint.Dark(baseCol, 0.08f),
                PressColor = Theme.Ok,
                ForeColor = Color.White,
                Dock = DockStyle.Fill,
                Margin = new Padding(5)
            };

            _toggleStates[controlKey] = false;
            _toggleButtons[controlKey] = new ToggleBtnInfo
            {
                Button = btn,
                BaseText = text,
                OffColor = baseCol
            };

            string keyCopy = controlKey;
            string textCopy = text;
            btn.Click += delegate
            {
                if (!_manualEnabled) return;
                if (ParkState.Instance.EmergencyStop)
                {
                    _lblStatus.Text = Loc.T("🔴 Manual operation blocked while Emergency Stop is active!", "🔴 ممنوع التشغيل اليدوي أثناء تفعيل إيقاف الطوارئ!");
                    _lblStatus.ForeColor = Theme.Err;
                    return;
                }
                bool nextState = !GetToggleState(keyCopy);
                ToggleControl(keyCopy, textCopy, nextState);
            };
            return btn;
        }

        bool GetToggleState(string controlKey)
        {
            bool val;
            return _toggleStates.TryGetValue(controlKey, out val) && val;
        }

        bool HasAnyActiveToggle()
        {
            foreach (var kv in _toggleStates)
                if (kv.Value) return true;
            return false;
        }

        void UpdateToggleVisual(string controlKey, bool active)
        {
            _toggleStates[controlKey] = active;
            ToggleBtnInfo info;
            if (!_toggleButtons.TryGetValue(controlKey, out info)) return;

            if (active)
            {
                info.Button.BaseColor = Theme.Ok;
                info.Button.HoverColor = Color.FromArgb(21, 128, 61);
                info.Button.BorderColor = Color.FromArgb(187, 247, 208);
                info.Button.Text = "● " + info.BaseText;
            }
            else
            {
                info.Button.BaseColor = info.OffColor;
                info.Button.HoverColor = ControlPaint.Dark(info.OffColor, 0.08f);
                info.Button.BorderColor = Color.Empty;
                info.Button.Text = "○ " + info.BaseText;
            }
            info.Button.Invalidate();
        }

        void ClearAllToggleVisuals()
        {
            var keys = new List<string>(_toggleButtons.Keys);
            for (int i = 0; i < keys.Count; i++)
                UpdateToggleVisual(keys[i], false);
        }

        void ToggleControl(string controlKey, string label, bool active)
        {
            // Keep UI synchronized with backend hydraulic UP/DOWN + Cutoff interlocks
            if (active && string.Equals(controlKey, "man_up_tag", StringComparison.OrdinalIgnoreCase))
            {
                UpdateToggleVisual("man_down_tag", false);
                UpdateToggleVisual("man_cutoff_tag", false);
            }
            else if (active && string.Equals(controlKey, "man_down_tag", StringComparison.OrdinalIgnoreCase))
            {
                UpdateToggleVisual("man_up_tag", false);
                UpdateToggleVisual("man_pump_tag", false);
                UpdateToggleVisual("man_cutoff_tag", false);
            }

            UpdateToggleVisual(controlKey, active);
            bool isStopper = IsStopperKey(controlKey);

            if (active)
            {
                _lblStatus.Text = Loc.T("🟢 Toggled ON (SetBit = 1): ", "🟢 تم التشغيل (Toggle ON = 1): ") + label + " (" + controlKey + ")";
                _lblStatus.ForeColor = Theme.Ok;
            }
            else
            {
                _lblStatus.Text = Loc.T("⚪ Toggled OFF (ResetBit = 0): ", "⚪ تم الإيقاف (Toggle OFF = 0): ") + label + " (" + controlKey + ")";
                _lblStatus.ForeColor = Theme.Ink;
            }

            string keyCopy = controlKey;
            string lblCopy = label;
            bool stateCopy = active;
            bool sendManualAction = isStopper;
            bool manualActionStateCopy = HasAnyActiveStopper() || (_activeMomentaryKey != null);
            ParkState.Instance.RecordLocalAudit(stateCopy ? "MANUAL_TOGGLE_ON" : "MANUAL_TOGGLE_OFF", keyCopy, lblCopy, Loc.UserDisplay(_shell.CurrentUser));
            ThreadPool.QueueUserWorkItem(delegate
            {
                ParkState.Instance.SendManualControl(keyCopy, stateCopy);
                if (sendManualAction)
                    ParkState.Instance.SendPlcWriteBool("M0.3", manualActionStateCopy, 0);
            });
        }

        void ReleaseAllOutputs(string reason)
        {
            bool allowWallWasOn = GetToggleState("allow_wall_tag");
            bool stopperOrLaneWasOn = HasAnyActiveStopper() || (_activeMomentaryKey != null);
            _activeMomentaryKey = null;
            ClearAllToggleVisuals();
            _lblStatus.Text = "🛑 " + reason;
            _lblStatus.ForeColor = Theme.Err;
            ParkState.Instance.RecordLocalAudit("MANUAL_STOP_ALL", "ALL_OUTPUTS", reason, Loc.UserDisplay(_shell.CurrentUser));
            ThreadPool.QueueUserWorkItem(delegate
            {
                // Atomic single-command release: clears all manual actuator bits + manual_action (%M0.3) + Accept_action_manual (%M0.4)
                ParkState.Instance.SendManualControl("stop_all_manual", false);
                if (allowWallWasOn)
                    ParkState.Instance.SendManualControl("allow_wall_tag", false);
                if (stopperOrLaneWasOn)
                {
                    ParkState.Instance.SendPlcWriteBool("M0.4", false, 0);
                    ParkState.Instance.SendPlcWriteBool("M0.3", false, 0);
                }
            });
        }

        void SetManualMode(bool enableManual)
        {
            if (enableManual && ParkState.Instance.EmergencyStop)
            {
                Loc.ShowMsg(
                    "Cannot enable Manual Mode while Emergency Stop is active.",
                    "لا يمكن تفعيل الوضع اليدوي أثناء حالة إيقاف الطوارئ.",
                    "Safety Warning", "تحذير أمان",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            if (!enableManual && HasAnyActiveToggle())
                ReleaseAllOutputs(Loc.T("Returning to Auto Mode — all manual outputs turned OFF", "العودة للوضع التلقائي — تم فصل جميع المخارج اليدوية"));

            _manualEnabled = enableManual;
            _manualControlsHost.Enabled = enableManual;
            ParkState.Instance.Sensors.ManualMode = enableManual;
            ParkState.Instance.Sensors.AutoMode = !enableManual;
            if (_liveMonitor != null) _liveMonitor.RenderNow();
            _lblStatus.Text = enableManual
                ? Loc.T("🟠 Home Mode Active — Controls unlocked. Press Home Position to return lift to home.", "🟠 وضع التموضع (Home Mode) مفعّل — اضغط الوضع الابتدائي (Home) لإرجاع المصعد.")
                : Loc.T("🟢 Auto Mode Active — Home Mode controls locked.", "🟢 الوضع التلقائي مفعّل — تم قفل أزرار وضع التموضع.");
            _lblStatus.ForeColor = enableManual ? Theme.Amber : Theme.Ok;

            ParkState.Instance.RecordLocalAudit("MODE_SWITCH", enableManual ? "MANUAL" : "AUTO",
                enableManual ? Loc.T("Enabled Manual Maintenance Mode", "تفعيل الوضع اليدوي للصيانة") : Loc.T("Returned to Auto Mode", "العودة للوضع التلقائي"),
                Loc.UserDisplay(_shell.CurrentUser));

            ThreadPool.QueueUserWorkItem(delegate
            {
                ParkState.Instance.SendManualControl(enableManual ? "manual_mode_tag" : "auto_mode_tag", true);
            });
        }

        void ConfirmResetSlot(string spotCode)
        {
            var res = Loc.ShowMsg(
                "Maintenance Warning:\n\nAre you sure you want to reset occupancy for bay (" + spotCode + ") in the PLC and local database?\nVisually verify that NO vehicle is inside this bay before proceeding!",
                "تحذير صيانة:\n\nهل أنت متأكد من تصفير حالة إشغال المصف (" + spotCode + ") في الـ PLC وقاعدة البيانات المحلية؟\nتأكد بصرياً من عدم وجود مركبة فعلية داخل هذا المصف قبل المتابعة!",
                "Double Confirmation — Reset Slot " + spotCode, "تأكيد مزدوج — Reset Slot " + spotCode,
                MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2);
            if (res != DialogResult.Yes) return;

            var st = ParkState.Instance;
            var sp = st.Spaces.Find(x => x.SpaceNumber == spotCode);
            if (sp != null)
            {
                sp.Status = "AVAILABLE";
                sp.PlateNumber = "";
                sp.OwnerName = "";
                sp.ParkedByUsername = "";
                sp.IsOtherVehicle = false;
                sp.UpdatedAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
            }
            st.RecordLocalAudit("RESET_SLOT", spotCode, Loc.T("Manual slot reset by maintenance", "تصفير يدوي للمصف بواسطة الصيانة"), Loc.UserDisplay(_shell.CurrentUser));
            st.NotifyChanged();

            string key = "spot_" + spotCode + "_tag";
            ThreadPool.QueueUserWorkItem(delegate { st.SendManualControl(key, false); });

            _lblStatus.Text = Loc.T("✅ Bay " + spotCode + " reset and logged in audit trail.", "✅ تم تصفير المصف " + spotCode + " وتسجيل العملية في سجل التدقيق.");
            _lblStatus.ForeColor = Theme.Ok;
        }

        void ConfirmToggleSpecial(string controlKey, string titleText)
        {
            var res = Loc.ShowMsg(
                "Confirm Maintenance Action:\n\n" + titleText + "\n\nSend this command to the PLC?",
                "تأكيد إجراء صيانة حساس:\n\n" + titleText + "\n\nهل تريد المتابعة وإرسال الأمر للـ PLC؟",
                "Maintenance Confirmation", "تأكيد الصيانة",
                MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2);
            if (res != DialogResult.Yes) return;

            if (controlKey == "maintenance_reset_tag")
                ParkState.Instance.Sensors.MaintenanceDue = false;

            ParkState.Instance.RecordLocalAudit("MAINT_ACTION", controlKey, titleText, Loc.UserDisplay(_shell.CurrentUser));
            ThreadPool.QueueUserWorkItem(delegate { ParkState.Instance.SendManualControl(controlKey, true); });
            _lblStatus.Text = Loc.T("✅ Executed: ", "✅ تم تنفيذ: ") + titleText;
            _lblStatus.ForeColor = Theme.Ok;
        }

        void ConfirmSoftPlcRecovery()
        {
            var res = Loc.ShowMsg(
                "Safe PLC Soft Recovery (No Main Power Cut):\n\nThis will:\n1. Release all manual outputs & clear stuck step flags (M0.3, M0.4, M10.0, M10.1)\n2. Pulse ParkDB.Reset (DB2,X10.0) without force-clearing active hardware faults\n3. Re-sync Auto Mode and refresh live S7-1200 telemetry\n\nProceed with safe software recovery?",
                "إنعاش وإعادة ضبط برمجية آمنة للـ PLC (بدون فصل الكهرباء الرئيسية):\n\nسيقوم النظام بما يلي:\n1. فصل جميع المخارج اليدوية وتصفير إشارات الخطوات العالقة (M0.3, M0.4, M10.0, M10.1)\n2. إرسال نبضة ParkDB.Reset الآمنة (DB2,X10.0)\n3. إعادة تفعيل الوضع التلقائي وتحديث الاتصال بالـ PLC\n\nهل تؤكد المتابعة؟",
                "PLC Soft Recovery", "إنعاش الـ PLC برمجياً",
                MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2);
            if (res != DialogResult.Yes) return;

            ReleaseAllOutputs(Loc.T("PLC Soft Recovery — releasing all outputs", "إنعاش الـ PLC — فصل جميع المخارج"));
            ParkState.Instance.RecordLocalAudit("PLC_SOFT_RECOVERY", "PLC",
                Loc.T("Executed safe software PLC recovery sequence", "تنفيذ إنعاش برمجي آمن للـ PLC بدون فصل الكهرباء"),
                Loc.UserDisplay(_shell.CurrentUser));

            ThreadPool.QueueUserWorkItem(delegate
            {
                ParkState.Instance.SendPlcWriteBool("M10.0", false, 0);
                ParkState.Instance.SendPlcWriteBool("M10.1", false, 0);
                ParkState.Instance.SendRecoveryAction("SAFE_RESET");
                ParkState.Instance.SendManualControl("auto_mode_tag", true);
                ParkState.Instance.PullSensorsFromBackend();
                if (!IsDisposed && IsHandleCreated)
                {
                    try
                    {
                        BeginInvoke((Action)delegate
                        {
                            _manualEnabled = false;
                            _manualControlsHost.Enabled = false;
                            _lblStatus.Text = Loc.T("✅ PLC Soft Recovery completed safely (Auto Mode synced).", "✅ تم إنعاش الـ PLC برمجياً بنجاح وإعادة مزامنة الوضع التلقائي.");
                            _lblStatus.ForeColor = Theme.Ok;
                            if (_liveMonitor != null) _liveMonitor.RenderNow();
                        });
                    }
                    catch { }
                }
            });
        }
    }

    /// <summary>
    /// Official Post-Emergency Recovery Dialog (Complete Seq | Return Park | Safe Reset | Clear E-Stop).
    /// </summary>
    class EmergencyRecoveryDialog : Form
    {
        readonly MainForm _shell;
        readonly Label _lblDiag;

        public EmergencyRecoveryDialog(MainForm shell)
        {
            _shell = shell;
            Theme.PrepareForm(this);
            Text = Loc.T("Emergency Stop Recovery", "إدارة واستعادة حالة الطوارئ (Emergency Recovery)");
            ClientSize = new Size(640, 440);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;

            var card = new Card { Dock = DockStyle.Fill, Margin = new Padding(14), Padding = new Padding(20) };

            var title = Theme.Label(
                Loc.T("🔴 Emergency Stop Recovery Panel", "🔴 لوحة استعادة الماكنة بعد إيقاف الطوارئ (Emergency Recovery)"),
                Theme.Bold(13f), Theme.Err);
            title.SetBounds(20, 14, 580, 32);

            _lblDiag = Theme.Label("", Theme.Semi(10f), Theme.Ink);
            _lblDiag.SetBounds(20, 54, 580, 110);
            _lblDiag.BackColor = Theme.ErrSoft;
            _lblDiag.Padding = new Padding(10);
            UpdateDiagnosticsText();

            var btnComplete = new ModernButton
            {
                Text = Loc.T("✅ Complete Sequence", "✅ إكمال المسار المتوقف (Complete Seq)"),
                IconGlyph = Icons.Check,
                BaseColor = Theme.Primary,
                HoverColor = Theme.PrimaryHover
            };
            btnComplete.SetBounds(20, 180, 280, 48);
            btnComplete.Click += delegate { RunRecovery("COMPLETE_SEQ", Loc.T("Complete Sequence (Complete Seq)", "إكمال المسار المتوقف (Complete Seq)")); };

            var btnReturn = new ModernButton
            {
                Text = Loc.T("↩ Return Platform (Return Park)", "↩ إرجاع المنصة للموضع الآمن (Return Park)"),
                IconGlyph = Icons.Back,
                BaseColor = Theme.Blue,
                HoverColor = Color.FromArgb(29, 78, 216)
            };
            btnReturn.SetBounds(316, 180, 284, 48);
            btnReturn.Click += delegate { RunRecovery("RETURN_PARK", Loc.T("Return Platform (Return Park)", "إرجاع المنصة للموضع الآمن (Return Park)")); };

            var btnSafeReset = new ModernButton
            {
                Text = Loc.T("🔄 Safe PLC Reset (ParkDB.Reset Only)", "🔄 إعادة ضبط آمنة للـ PLC (Safe Reset — ParkDB.Reset)"),
                IconGlyph = Icons.Refresh,
                BaseColor = Theme.Amber,
                HoverColor = Color.FromArgb(180, 83, 9)
            };
            btnSafeReset.SetBounds(20, 242, 580, 46);
            btnSafeReset.Click += delegate { RunRecovery("SAFE_RESET", Loc.T("Safe Reset (ParkDB.Reset without zeroing Alarm Word)", "إعادة ضبط آمنة (ParkDB.Reset بدون تصفير Alarm Word)")); };

            var btnClearEstop = new ModernButton
            {
                Text = Loc.T("🔓 Clear Emergency Stop & Resume Normal Operation", "🔓 إلغاء حالة الطوارئ والعودة للتشغيل الطبيعي (Clear E-Stop)"),
                IconGlyph = Icons.Shield,
                BaseColor = Theme.Ok,
                HoverColor = Color.FromArgb(21, 128, 61)
            };
            btnClearEstop.SetBounds(20, 302, 580, 48);
            btnClearEstop.Click += delegate
            {
                var confirm = Loc.ShowMsg(
                    "Safety Confirmation Before Clearing E-Stop:\n\n1. Has the physical E-Stop button (ES1/ES2) been released?\n2. Are the lift shaft and entrance (PCELL_IN_1) completely clear?\n\nClick 'Yes' to clear Emergency Stop and resume operation.",
                    "تأكيد السلامة قبل إلغاء الطوارئ:\n\n1. هل تم تحرير مفتاح الطوارئ الفيزيائي (ES1 / ES2)؟\n2. هل منطقة المصعد والمدخل (PCELL_IN_1) خالية تماماً من أي عوائق؟\n\nاضغط «نعم» لإلغاء حالة الطوارئ واستئناف التشغيل.",
                    "Safety Confirmation", "تأكيد السلامة",
                    MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2);
                if (confirm != DialogResult.Yes) return;
                RunRecovery("ESTOP_OFF", Loc.T("Cleared Emergency Stop after safety verification", "إلغاء حالة إيقاف الطوارئ بعد التحقق من الأمان"));
            };

            var btnClose = new ModernButton
            {
                Text = Loc.T("Close", "إغلاق"),
                BaseColor = Theme.Back,
                HoverColor = Theme.Border,
                ForeColor = Theme.Ink,
                BorderColor = Theme.Border
            };
            btnClose.SetBounds(220, 366, 180, 40);
            btnClose.Click += delegate { Close(); };

            card.Controls.AddRange(new Control[] { title, _lblDiag, btnComplete, btnReturn, btnSafeReset, btnClearEstop, btnClose });
            Controls.Add(card);
        }

        void UpdateDiagnosticsText()
        {
            var st = ParkState.Instance;
            var s = st.Sensors;
            string faults = "";
            if (st.EmergencyStop || s.EmergencyPhysical) faults += Loc.T("• Emergency Stop (ES1/ES2) is ACTIVE\n", "• إيقاف الطوارئ (ES1/ES2) مفعّل\n");
            if (s.EmergencyDuringMove) faults += Loc.T("• Emergency occurred during lift movement\n", "• حدث التوقف أثناء حركة المصعد (Emergency During Up/Down)\n");
            if (s.ErrorInPosition) faults += Loc.T("• Error in lift position (Alarm Section Bit 11)\n", "• خطأ في تموضع المصعد (Error in position)\n");
            if (s.StopperFault) faults += Loc.T("• Mechanical stopper not energized (Bit 12)\n", "• الموقف الميكانيكي Stopper غير مفعّل\n");
            if (s.LiftInvalidPos) faults += Loc.T("• Lift not in valid position (Bit 13)\n", "• المصعد في موضع غير صالح\n");
            if (!s.PhotocellClear || s.ObstacleExist) faults += Loc.T("• Obstacle detected at entrance or lift shaft\n", "• عائق مرصود عند المدخل أو داخل المصعد\n");
            if (string.IsNullOrEmpty(faults)) faults = Loc.T("• No active faults — system is ready to clear E-Stop or reset.", "• لا توجد أعطال نشطة حالياً — النظام جاهز لإلغاء الطوارئ أو إعادة الضبط.");
            _lblDiag.Text = Loc.T("Current Diagnostics:\n", "حالة التشخيص الحالية:\n") + faults;
        }

        void RunRecovery(string action, string desc)
        {
            var st = ParkState.Instance;
            if (action == "ESTOP_OFF" || action == "COMPLETE_SEQ" || action == "RETURN_PARK")
            {
                st.EmergencyStop = false;
                st.Sensors.EmergencyPhysical = false;
                st.Sensors.EmergencyDuringMove = false;
                foreach (var a in st.Alarms)
                {
                    if ((a.Code == "E_STOP_MANUAL" || a.Code == "PLC_EMERGENCY_STOP") && a.Status != "RESOLVED")
                    {
                        a.Status = "RESOLVED";
                        a.AcknowledgedBy = Loc.UserDisplay(_shell.CurrentUser);
                    }
                }
            }
            st.RecordLocalAudit("RECOVERY_" + action, "SAFETY", desc, Loc.UserDisplay(_shell.CurrentUser));
            st.NotifyChanged();

            string actCopy = action;
            ThreadPool.QueueUserWorkItem(delegate { st.SendRecoveryAction(actCopy); });

            Loc.ShowMsg(
                "Action completed successfully:\n" + desc,
                "تم تنفيذ الإجراء بنجاح:\n" + desc,
                "Emergency Recovery", "استعادة الطوارئ",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            UpdateDiagnosticsText();
            if (action != "SAFE_RESET") Close();
        }
    }

    /// <summary>
    /// Employee Mobile Devices & MAC Address Access Control (Instant Revocation on Resignation).
    /// </summary>
    class DevicesManagementPage : Panel
    {
        readonly MainForm _shell;
        readonly TextBox _txtEmpName, _txtMac, _txtDevId, _txtModel;
        readonly ComboBox _cmbUser;
        readonly CheckBox _chkEnforce;
        readonly DataGridView _grid;
        readonly Label _lblInfo;

        public DevicesManagementPage(MainForm shell)
        {
            _shell = shell;
            BackColor = Theme.Back;

            if (!shell.CurrentUser.IsAdmin)
            {
                var denied = Theme.Label(
                    Loc.T("⛔ Access Denied: Only System Administrators can manage employee mobile devices and MAC addresses.",
                          "⛔ هذه الشاشة مخصصة فقط لمدير النظام لإدارة أجهزة الموظفين وعناوين الـ MAC Address."),
                    Theme.Bold(12.5f), Theme.Err);
                denied.Dock = DockStyle.Fill;
                denied.TextAlign = ContentAlignment.MiddleCenter;
                Controls.Add(denied);
                return;
            }

            var topCard = new Card { Dock = DockStyle.Top, Height = 152, Padding = new Padding(16, 10, 16, 10), Margin = new Padding(0, 0, 0, 10) };

            var lblTitle = Theme.Label(
                Loc.T("Authorize Employee Mobile Device (by MAC Address or App Device ID) — Only Registered Employees Can Access the App:",
                      "تسجيل جهاز موبايل جديد للموظف (عبر MAC Address أو معرّف الهاتف Device ID) — فقط الموظفون المعرّفون يدخلون للتطبيق:"),
                Theme.Bold(10.8f), Theme.Ink);
            lblTitle.SetBounds(16, 8, 920, 24);

            _txtEmpName = MakeField(topCard, Loc.T("Employee Full Name:", "اسم الموظف الكامل:"), 16, 54, 180);

            var capUser = Theme.Label(Loc.T("Employee Username:", "حساب الموظف (مطلوب للربط):"), Theme.F(8.5f), Theme.Muted);
            capUser.SetBounds(206, 36, 150, 16);
            _cmbUser = new ComboBox { DropDownStyle = ComboBoxStyle.DropDown, Font = Theme.F(9.8f) };
            _cmbUser.SetBounds(206, 54, 150, 32);
            _cmbUser.Items.Add("");
            foreach (var u in shell.Settings.Users.Values)
                if (u.Role != "CUSTOMER") _cmbUser.Items.Add(u.Username);
            topCard.Controls.Add(capUser);
            topCard.Controls.Add(_cmbUser);

            _txtMac = MakeField(topCard, Loc.T("MAC Address (e.g. AA:BB:CC:DD:EE:FF):", "عنوان MAC Address (مثال AA:BB:CC:DD:EE:FF):"), 366, 54, 215);
            _txtDevId = MakeField(topCard, Loc.T("Mobile Device ID (from Login screen):", "معرّف الهاتف Device ID (من شاشة التطبيق):"), 591, 54, 195);
            _txtModel = MakeField(topCard, Loc.T("Phone Model (Samsung / iPhone):", "نوع الهاتف (Samsung / iPhone):"), 796, 54, 150);

            var btnAdd = new ModernButton
            {
                Text = Loc.T("✚ Authorize Device", "✚ تصريح الجهاز"),
                IconGlyph = Icons.Check,
                BaseColor = Theme.Primary,
                HoverColor = Theme.PrimaryHover
            };
            btnAdd.SetBounds(956, 50, 155, 38);
            btnAdd.Click += OnAddDevice;

            _chkEnforce = new CheckBox
            {
                Text = Loc.T("🔒 Strict Whitelist: Allow ONLY Registered Employee Phones (Blocks all unregistered & revoked devices)",
                             "🔒 تقييد الدخول والتحكم من الموبايل للهواتف المصرّح بها للموظفين فقط (يمنع أي جهاز غير مسجّل أو ملغى)"),
                Checked = ParkState.Instance.EnforceDeviceWhitelist,
                AutoSize = true,
                Font = Theme.Semi(9.5f),
                ForeColor = Theme.Primary
            };
            _chkEnforce.SetBounds(16, 102, 780, 26);
            _chkEnforce.CheckedChanged += delegate
            {
                bool val = _chkEnforce.Checked;
                ParkState.Instance.SetDeviceWhitelistPolicyOnBackend(val);
                _lblInfo.Text = val
                    ? Loc.T("🔒 Strict whitelist ON: Only registered employee phones are allowed.", "🔒 تم تفعيل التقييد: لا يسمح إلا للهواتف المسجّلة والمفعّلة.")
                    : Loc.T("🟡 Whitelist relaxed (Revoked employee devices remain permanently blocked).", "🟡 تم تعطيل التقييد (الهواتف الملغاة تبقى محظورة دائماً).");
            };

            _lblInfo = Theme.Label(
                Loc.T("When an employee resigns, click '🚫 Revoke Control' to instantly block their phone and terminate all active sessions.",
                      "عند استقالة أي موظف اضغط «🚫 إلغاء التحكم» لإيقاف هاتفه وإغلاق جلساته فوراً."),
                Theme.F(9f), Theme.Muted);
            _lblInfo.SetBounds(16, 126, 950, 20);

            var btnRefresh = new ModernButton
            {
                Text = Loc.T("Refresh List", "تحديث القائمة"),
                IconGlyph = Icons.Refresh,
                BaseColor = Theme.Surface,
                HoverColor = Theme.SurfaceHover,
                BorderColor = Theme.Border,
                ForeColor = Theme.Ink
            };
            btnRefresh.SetBounds(956, 98, 155, 36);
            btnRefresh.Click += delegate { RefreshDevices(); };

            topCard.Controls.AddRange(new Control[] { lblTitle, btnAdd, _chkEnforce, _lblInfo, btnRefresh });

            var gridCard = new Card { Dock = DockStyle.Fill, Padding = new Padding(12) };
            _grid = VehiclesPage.CreateStyledGrid();
            _grid.Columns.Add("Id", "ID");
            _grid.Columns["Id"].Visible = false;
            _grid.Columns.Add("Employee", Loc.T("Employee Name", "اسم الموظف"));
            _grid.Columns.Add("Username", Loc.T("Username", "الحساب"));
            _grid.Columns.Add("Mac", "MAC Address");
            _grid.Columns.Add("DeviceId", Loc.T("Device ID", "معرّف الجهاز (Device ID)"));
            _grid.Columns.Add("Model", Loc.T("Phone Model", "نوع الهاتف"));
            _grid.Columns.Add("Status", Loc.T("Status", "الحالة"));
            _grid.Columns.Add("Reason", Loc.T("Revoke Reason / Last Seen", "سبب الإلغاء / آخر ظهور"));

            var colEdit = new DataGridViewButtonColumn
            {
                Name = "Edit",
                HeaderText = Loc.T("Edit", "تعديل"),
                Text = Loc.T("✏️ Edit", "✏️ تعديل"),
                UseColumnTextForButtonValue = true,
                Width = 85,
                AutoSizeMode = DataGridViewAutoSizeColumnMode.None
            };
            var colRevoke = new DataGridViewButtonColumn
            {
                Name = "Revoke",
                HeaderText = Loc.T("Revoke (Resigned)", "إلغاء (استقالة)"),
                Text = Loc.T("🚫 Revoke", "🚫 إلغاء التحكم"),
                UseColumnTextForButtonValue = true,
                Width = 115,
                AutoSizeMode = DataGridViewAutoSizeColumnMode.None
            };
            var colActivate = new DataGridViewButtonColumn
            {
                Name = "Activate",
                HeaderText = Loc.T("Activate", "تفعيل"),
                Text = Loc.T("✅ Enable", "✅ تفعيل"),
                UseColumnTextForButtonValue = true,
                Width = 85,
                AutoSizeMode = DataGridViewAutoSizeColumnMode.None
            };
            var colDel = new DataGridViewButtonColumn
            {
                Name = "Delete",
                HeaderText = Loc.T("Delete", "حذف"),
                Text = Loc.T("🗑 Delete", "🗑 حذف"),
                UseColumnTextForButtonValue = true,
                Width = 80,
                AutoSizeMode = DataGridViewAutoSizeColumnMode.None
            };
            _grid.Columns.Add(colEdit);
            _grid.Columns.Add(colRevoke);
            _grid.Columns.Add(colActivate);
            _grid.Columns.Add(colDel);

            foreach (DataGridViewColumn c in _grid.Columns)
            {
                if (c.Name != "Edit" && c.Name != "Revoke" && c.Name != "Activate" && c.Name != "Delete")
                    c.ReadOnly = true;
            }

            _grid.CellClick += OnGridCellClick;
            _grid.CellDoubleClick += delegate (object s, DataGridViewCellEventArgs ev)
            {
                if (ev.RowIndex >= 0)
                {
                    string rowId = Convert.ToString(_grid.Rows[ev.RowIndex].Cells["Id"].Value);
                    var found = ParkState.Instance.Devices.Find(x => x.Id == rowId);
                    if (found != null) ShowEditDeviceDialog(found);
                }
            };

            gridCard.Controls.Add(_grid);
            Controls.Add(gridCard);
            Controls.Add(topCard);

            RefreshDevices();
        }

        void ShowEditDeviceDialog(AuthorizedDeviceItem dev)
        {
            var dlg = new Form
            {
                Text = Loc.T("Edit Authorized MAC Device", "تعديل بيانات وعنوان MAC للجهاز"),
                Size = new Size(460, 410),
                StartPosition = FormStartPosition.CenterParent,
                FormBorderStyle = FormBorderStyle.FixedDialog,
                MaximizeBox = false,
                MinimizeBox = false,
                BackColor = Theme.Surface,
                RightToLeft = Loc.IsArabic ? RightToLeft.Yes : RightToLeft.No,
                RightToLeftLayout = Loc.IsArabic
            };

            var tbEmp = MakeField(dlg, Loc.T("Employee Full Name:", "اسم الموظف الكامل:"), 22, 34, 400);
            tbEmp.Text = dev.EmployeeName ?? "";

            var capUsr = Theme.Label(Loc.T("Employee Username:", "حساب الموظف:"), Theme.F(8.5f), Theme.Muted);
            capUsr.SetBounds(22, 74, 400, 16);
            var cmbUsr = new ComboBox { DropDownStyle = ComboBoxStyle.DropDown, Font = Theme.F(9.8f) };
            cmbUsr.SetBounds(22, 92, 400, 32);
            cmbUsr.Items.Add("");
            foreach (var u in _shell.Settings.Users.Values)
                if (u.Role != "CUSTOMER") cmbUsr.Items.Add(u.Username);
            cmbUsr.Text = dev.Username ?? "";
            dlg.Controls.Add(capUsr);
            dlg.Controls.Add(cmbUsr);

            var tbMac = MakeField(dlg, Loc.T("MAC Address (AA:BB:CC:DD:EE:FF):", "عنوان MAC Address (مثال AA:BB:CC:DD:EE:FF):"), 22, 150, 400);
            tbMac.Text = dev.MacAddress ?? "";

            var tbDevId = MakeField(dlg, Loc.T("Mobile Device ID (Optional):", "معرّف الهاتف Device ID (اختياري):"), 22, 208, 400);
            tbDevId.Text = dev.DeviceId ?? "";

            var tbModel = MakeField(dlg, Loc.T("Phone Model (Samsung / iPhone):", "نوع الهاتف (Samsung / iPhone):"), 22, 266, 400);
            tbModel.Text = dev.DeviceModel ?? "";

            var chkCtrl = new CheckBox
            {
                Text = Loc.T("Allow remote parking control from this phone", "السماح بالتحكم بالمواقف من هذا الهاتف"),
                Checked = dev.CanControl,
                AutoSize = true,
                Font = Theme.Semi(9.2f),
                ForeColor = Theme.Ink
            };
            chkCtrl.SetBounds(22, 304, 400, 24);
            dlg.Controls.Add(chkCtrl);

            var btnSave = new ModernButton
            {
                Text = Loc.T("Save Changes", "حفظ التعديلات"),
                IconGlyph = Icons.Check,
                BaseColor = Theme.Primary,
                HoverColor = Theme.PrimaryHover
            };
            btnSave.SetBounds(22, 336, 190, 34);

            var btnCancel = new ModernButton
            {
                Text = Loc.T("Cancel", "إلغاء"),
                BaseColor = Theme.SurfaceHover,
                HoverColor = Theme.Border,
                ForeColor = Theme.Ink
            };
            btnCancel.SetBounds(232, 336, 190, 34);
            btnCancel.Click += delegate { dlg.DialogResult = DialogResult.Cancel; dlg.Close(); };

            btnSave.Click += delegate
            {
                string emp = tbEmp.Text.Trim();
                string usr = cmbUsr.Text.Trim();
                string mac = tbMac.Text.Trim().ToUpperInvariant();
                string dId = tbDevId.Text.Trim().ToUpperInvariant();
                string mdl = tbModel.Text.Trim();
                if (string.IsNullOrEmpty(emp))
                {
                    Loc.ShowMsg("Employee name is required.", "اسم الموظف مطلوب.", "Warning", "تنبيه", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                if (string.IsNullOrEmpty(mac) && string.IsNullOrEmpty(dId))
                {
                    Loc.ShowMsg("Please keep at least a MAC Address or Device ID.", "يرجى إدخال عنوان MAC Address أو معرّف الجهاز على الأقل.", "Warning", "تنبيه", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                try
                {
                    ParkState.Instance.UpdateDeviceOnBackend(dev.Id, emp, usr, mac, dId, mdl, chkCtrl.Checked);
                    ParkState.Instance.RecordLocalAudit("DEVICE_UPDATE", string.IsNullOrEmpty(mac) ? dId : mac,
                        Loc.T("Updated employee device: ", "تعديل بيانات وعنوان MAC للجهاز: ") + emp, Loc.UserDisplay(_shell.CurrentUser));
                    _lblInfo.ForeColor = Theme.Ok;
                    _lblInfo.Text = Loc.T("✅ Updated device details for " + emp + ".", "✅ تم حفظ تعديل عنوان الـ MAC وبيانات الجهاز للموظف (" + emp + ") بنجاح.");
                    LoadGrid();
                    dlg.DialogResult = DialogResult.OK;
                    dlg.Close();
                }
                catch (Exception ex)
                {
                    Loc.ShowMsg("Failed to update device:\n" + ex.Message, "تعذر تعديل بيانات الجهاز:\n" + ex.Message, "Error", "خطأ", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            };

            dlg.Controls.Add(btnSave);
            dlg.Controls.Add(btnCancel);
            dlg.ShowDialog(FindForm());
            dlg.Dispose();
        }

        static TextBox MakeField(Control parent, string caption, int x, int y, int w)
        {
            var cap = Theme.Label(caption, Theme.F(8.5f), Theme.Muted);
            cap.SetBounds(x, y - 18, w, 16);
            var tb = new TextBox { Font = Theme.F(9.8f) };
            tb.SetBounds(x, y, w, 32);
            parent.Controls.Add(cap);
            parent.Controls.Add(tb);
            return tb;
        }

        void OnAddDevice(object sender, EventArgs e)
        {
            string emp = _txtEmpName.Text.Trim();
            string usr = _cmbUser.Text.Trim();
            string mac = _txtMac.Text.Trim().ToUpperInvariant();
            string devId = _txtDevId.Text.Trim().ToUpperInvariant();
            string model = _txtModel.Text.Trim();

            if (string.IsNullOrEmpty(emp))
            {
                Loc.ShowMsg("Please enter the employee's full name.", "يرجى إدخال اسم الموظف.", "Warning", "تنبيه", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            if (string.IsNullOrEmpty(mac) && string.IsNullOrEmpty(devId))
            {
                Loc.ShowMsg("Please enter either a MAC Address or a Mobile Device ID.", "يرجى إدخال عنوان MAC Address للهاتف أو معرّف الجهاز (Device ID).", "Warning", "تنبيه", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            try
            {
                ParkState.Instance.RegisterDeviceOnBackend(emp, usr, mac, devId, model);
                ParkState.Instance.RecordLocalAudit("DEVICE_ADD", string.IsNullOrEmpty(mac) ? devId : mac,
                    Loc.T("Authorized employee phone: ", "تسجيل جهاز الموظف: ") + emp, Loc.UserDisplay(_shell.CurrentUser));
                _txtEmpName.Text = "";
                _txtMac.Text = "";
                _txtDevId.Text = "";
                _txtModel.Text = "";
                _lblInfo.ForeColor = Theme.Ok;
                _lblInfo.Text = Loc.T("✅ Employee phone (" + emp + ") authorized successfully.", "✅ تم تسجيل وتصريح هاتف الموظف (" + emp + ") بنجاح.");
                LoadGrid();
            }
            catch (Exception ex)
            {
                Loc.ShowMsg("Failed to register device:\n" + ex.Message, "تعذر تسجيل الجهاز:\n" + ex.Message, "Error", "خطأ", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        void OnGridCellClick(object sender, DataGridViewCellEventArgs ev)
        {
            if (ev.RowIndex < 0) return;
            string id = Convert.ToString(_grid.Rows[ev.RowIndex].Cells["Id"].Value);
            string emp = Convert.ToString(_grid.Rows[ev.RowIndex].Cells["Employee"].Value);
            string mac = Convert.ToString(_grid.Rows[ev.RowIndex].Cells["Mac"].Value);

            if (ev.ColumnIndex == _grid.Columns["Edit"].Index)
            {
                var found = ParkState.Instance.Devices.Find(x => x.Id == id);
                if (found != null) ShowEditDeviceDialog(found);
                return;
            }
            if (ev.ColumnIndex == _grid.Columns["Revoke"].Index)
            {
                var conf = Loc.ShowMsg(
                    "Confirm Employee Resignation & Access Revocation:\n\n• Employee: " + emp + "\n• Device/MAC: " + mac + "\n\nThis will IMMEDIATELY block this phone from controlling Auto Park and terminate all active sessions.\nAlso disable the employee's user account?\n(Yes = Revoke Phone + Disable Account | No = Revoke Phone Only)",
                    "تأكيد إلغاء صلاحية الموظف عند الاستقالة:\n\n• الموظف: " + emp + "\n• الجهاز/MAC: " + mac + "\n\nسيتم إيقاف تحكم هذا الهاتف بنظام Auto Park فوراً وإنهاء جلساته النشطة.\nهل تريد أيضاً تعطيل حساب الموظف بالكامل؟\n(نعم = إلغاء الهاتف + تعطيل الحساب | لا = إلغاء الهاتف فقط)",
                    "Revoke Employee Access", "إلغاء صلاحية جهاز موظف مستقيل",
                    MessageBoxButtons.YesNoCancel, MessageBoxIcon.Warning);
                if (conf == DialogResult.Cancel) return;
                bool disableUser = (conf == DialogResult.Yes);
                try
                {
                    ParkState.Instance.RevokeDeviceOnBackend(id, Loc.T("Employee resigned — Auto Park control revoked", "استقالة الموظف — إلغاء التحكم بنظام Auto Park"), disableUser);
                    ParkState.Instance.RecordLocalAudit("DEVICE_REVOKE", mac, Loc.T("Revoked resigned employee phone: ", "إلغاء صلاحية هاتف الموظف المستقيل: ") + emp, Loc.UserDisplay(_shell.CurrentUser));
                    _lblInfo.ForeColor = Theme.Err;
                    _lblInfo.Text = Loc.T("🚫 Access revoked immediately for " + emp + ".", "🚫 تم إلغاء صلاحية هاتف الموظف (" + emp + ") فوراً — لم يعد بإمكانه التحكم بنظام Auto Park.");
                    LoadGrid();
                }
                catch (Exception ex)
                {
                    Loc.ShowMsg("Error: " + ex.Message, "خطأ: " + ex.Message, "Error", "خطأ", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
            else if (ev.ColumnIndex == _grid.Columns["Activate"].Index)
            {
                try
                {
                    ParkState.Instance.ActivateDeviceOnBackend(id);
                    ParkState.Instance.RecordLocalAudit("DEVICE_ACTIVATE", mac, Loc.T("Re-enabled employee phone: ", "إعادة تفعيل هاتف الموظف: ") + emp, Loc.UserDisplay(_shell.CurrentUser));
                    _lblInfo.ForeColor = Theme.Ok;
                    _lblInfo.Text = Loc.T("✅ Re-enabled phone for " + emp + ".", "✅ تم إعادة تفعيل هاتف الموظف (" + emp + ").");
                    LoadGrid();
                }
                catch (Exception ex)
                {
                    Loc.ShowMsg("Error: " + ex.Message, "خطأ: " + ex.Message, "Error", "خطأ", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
            else if (ev.ColumnIndex == _grid.Columns["Delete"].Index)
            {
                var conf = Loc.ShowMsg("Permanently delete this device record?", "هل تريد حذف سجل هذا الجهاز نهائياً؟", "Confirm Delete", "تأكيد الحذف", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2);
                if (conf != DialogResult.Yes) return;
                try
                {
                    ParkState.Instance.DeleteDeviceOnBackend(id);
                    LoadGrid();
                }
                catch (Exception ex)
                {
                    Loc.ShowMsg("Error: " + ex.Message, "خطأ: " + ex.Message, "Error", "خطأ", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
        }

        void RefreshDevices()
        {
            ParkState.Instance.PullDevicesFromBackend();
            _chkEnforce.Checked = ParkState.Instance.EnforceDeviceWhitelist;
            LoadGrid();
        }

        void LoadGrid()
        {
            _grid.Rows.Clear();
            foreach (var d in ParkState.Instance.Devices)
            {
                string stLabel = d.Status == "REVOKED" ? Loc.T("🔴 Revoked (Blocked)", "🔴 ملغى (محظور)") : Loc.T("🟢 Active (Authorized)", "🟢 مفعّل (مصرح)");
                string note = d.Status == "REVOKED"
                    ? (string.IsNullOrEmpty(d.RevokeReason) ? Loc.T("Revoked", "تم الإلغاء") : d.RevokeReason)
                    : (string.IsNullOrEmpty(d.LastSeenAt) ? Loc.T("Never connected", "لم يتصل بعد") : Loc.T("Last seen: ", "آخر اتصال: ") + d.LastSeenAt);
                _grid.Rows.Add(
                    d.Id,
                    d.EmployeeName,
                    string.IsNullOrEmpty(d.Username) ? "—" : d.Username,
                    string.IsNullOrEmpty(d.MacAddress) ? "—" : d.MacAddress,
                    string.IsNullOrEmpty(d.DeviceId) ? "—" : d.DeviceId,
                    string.IsNullOrEmpty(d.DeviceModel) ? "—" : d.DeviceModel,
                    stLabel,
                    note
                );
            }
        }
    }
}
