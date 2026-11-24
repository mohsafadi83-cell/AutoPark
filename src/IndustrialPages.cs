using System;
using System.Collections.Generic;
using System.Drawing;
using System.Threading;
using System.Windows.Forms;

namespace AutoPark
{
    /// <summary>
    /// Live Sensor & Limit-Switch Monitor (Status Monitor — 4 Lanes × 3 Floors + MG_PROT + Safety Interlocks).
    /// </summary>
    class SensorMonitorPage : Panel
    {
        readonly MainForm _shell;
        readonly System.Windows.Forms.Timer _refreshTimer;
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
        readonly Label[,] _lsCells = new Label[4, 3]; // [lane 0..3, 0=BTM(P1), 1=MID(P2), 2=TOP(P3)]
        readonly Label[] _mgCells = new Label[4];
        readonly Label[] _locCells = new Label[4];
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
                _lsCells[lane, 2] = MakeLedCell("PL" + (lane + 1) + "_LS_TOP");
                _lsCells[lane, 1] = MakeLedCell("PL" + (lane + 1) + "_LS_MID");
                _lsCells[lane, 0] = MakeLedCell("PL" + (lane + 1) + "_LS_BTM");
                _mgCells[lane] = MakeLedCell("PL" + (lane + 1) + "_MG_PROT");
                _locCells[lane] = MakeLedCell("Lane" + (lane + 1) + "_check");

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

        Label MakeLedCell(string tagName)
        {
            return new Label
            {
                Text = "● " + tagName,
                Font = Theme.Bold(9.5f),
                TextAlign = ContentAlignment.MiddleCenter,
                Dock = DockStyle.Fill,
                Margin = new Padding(4, 6, 4, 6),
                BackColor = Theme.Back,
                ForeColor = Theme.Muted
            };
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
                    string tagSuffix = lv == 2 ? "LS_TOP" : (lv == 1 ? "LS_MID" : "LS_BTM");
                    string tagLabel = "PL" + (lane + 1) + "_" + tagSuffix;
                    var cell = _lsCells[lane, lv];
                    if (s.LiveConnected && !lsMapped)
                    {
                        cell.Text = Loc.T("⚙ %I Unmapped — ", "⚙ غير مربوط (%I) — ") + tagLabel;
                        cell.BackColor = Theme.AmberSoft;
                        cell.ForeColor = Theme.Amber;
                    }
                    else
                    {
                        bool on = s.LimitSwitches[lane, lv];
                        cell.Text = (on ? "🟢 ON — " : "⚪ OFF — ") + tagLabel;
                        cell.BackColor = on ? Theme.OkSoft : Theme.Back;
                        cell.ForeColor = on ? Theme.Ok : Theme.Muted;
                    }
                }

                if (s.LiveConnected && !s.MgProtMapped[lane])
                {
                    _mgCells[lane].Text = Loc.T("⚙ %I Unmapped (MG_PROT)", "⚙ غير مربوط (%I)");
                    _mgCells[lane].BackColor = Theme.AmberSoft;
                    _mgCells[lane].ForeColor = Theme.Amber;
                }
                else
                {
                    // MG_PROT polarity is not documented; show the raw %I state neutrally (no assumed safe/tripped meaning)
                    bool mg = s.MgProt[lane];
                    _mgCells[lane].Text = mg ? Loc.T("🟢 Input ON (1)", "🟢 المدخل ON (1)") : Loc.T("⚪ Input OFF (0)", "⚪ المدخل OFF (0)");
                    _mgCells[lane].BackColor = mg ? Theme.OkSoft : Theme.Back;
                    _mgCells[lane].ForeColor = mg ? Theme.Ok : Theme.Muted;
                }

                bool loc = s.CheckLocation[lane];
                _locCells[lane].Text = loc ? Loc.T("🟢 Triggered (1)", "🟢 مفعّل (1)") : Loc.T("⚪ Idle (0)", "⚪ خامل (0)");
                _locCells[lane].BackColor = loc ? Theme.OkSoft : Theme.Back;
                _locCells[lane].ForeColor = loc ? Theme.Ok : Theme.Muted;
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
        readonly Panel _controlsContainer;
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

            var modeBar = new Panel { Dock = DockStyle.Top, Height = 56, Padding = new Padding(0, 6, 0, 6) };
            _btnModeManual = new ModernButton
            {
                Text = Loc.T("Enable Manual Mode", "تفعيل الوضع اليدوي (Manual)"),
                IconGlyph = Icons.Settings,
                BaseColor = Theme.Amber,
                HoverColor = Color.FromArgb(180, 83, 9)
            };
            _btnModeManual.Click += delegate { SetManualMode(true); };

            _btnModeAuto = new ModernButton
            {
                Text = Loc.T("Return to Auto Mode", "العودة للوضع التلقائي (Auto)"),
                IconGlyph = Icons.Check,
                BaseColor = Theme.Ok,
                HoverColor = Color.FromArgb(21, 128, 61)
            };
            _btnModeAuto.Click += delegate { SetManualMode(false); };

            var btnStopAll = new ModernButton
            {
                Text = Loc.T("🛑 Stop All Outputs", "🛑 إيقاف جميع المخارج فوراً"),
                IconGlyph = Icons.Shield,
                BaseColor = Theme.Err,
                HoverColor = Color.FromArgb(185, 28, 28)
            };
            btnStopAll.Click += delegate { ReleaseAllOutputs(Loc.T("Immediate stop of all manual outputs", "إيقاف فوري لجميع المخارج اليدوية")); };

            _lblStatus = Theme.Label(
                Loc.T("Current Mode: Auto — Enable Manual Mode to operate maintenance controls.",
                      "الوضع الحالي: تلقائي (Auto Mode) — فعّل الوضع اليدوي لاستخدام أزرار الصيانة."),
                Theme.Semi(10f), Theme.Ink);
            _lblStatus.Dock = DockStyle.Fill;

            modeBar.Controls.Add(_lblStatus);
            modeBar.Controls.Add(Theme.Holder(_btnModeManual, startDock, 220, new Padding(6, 2, 6, 2)));
            modeBar.Controls.Add(Theme.Holder(_btnModeAuto, startDock, 220, new Padding(6, 2, 6, 2)));
            modeBar.Controls.Add(Theme.Holder(btnStopAll, endDock, 195, new Padding(6, 2, 6, 2)));

            _controlsContainer = new Panel { Dock = DockStyle.Fill, Enabled = false };
            var split = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 1,
                Padding = new Padding(0, 4, 0, 4)
            };
            split.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 58f));
            split.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 42f));

            var holdCard = new Card { Dock = DockStyle.Fill, Padding = new Padding(16), Margin = new Padding(6) };
            var holdTitle = Theme.Label(
                Loc.T("Direct Manual Controls (Rows 1–3 Toggle | Stoppers S1–S4 also toggle M0.4 | Row 4 Lanes L1–L4 Momentary):",
                      "التحكم اليدوي المباشر (الصفوف 1–3 تبديل Toggle | Stoppers S1–S4 تبدّل أيضاً M0.4 | الصف السفلي L1–L4 لحظي Momentary):"),
                Theme.Bold(10.0f), Theme.Primary);
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
            holdGrid.Controls.Add(MakeToggleButton(Loc.T("⬇ Lift DOWN", "⬇ نزول (DOWN)"), "man_down_tag", Color.FromArgb(30, 64, 175)), 2, 0);
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

            var slotsCard = new Card { Dock = DockStyle.Fill, Padding = new Padding(16), Margin = new Padding(6) };
            var slotsTitle = Theme.Label(
                Loc.T("Protected Slot Occupancy Reset (Double Confirmation + Audit Log):",
                      "إعادة ضبط إشغال المصفات (Reset Slots — محمي بتأكيد مزدوج وسجل تدقيق):"),
                Theme.Bold(10.2f), Theme.Err);
            slotsTitle.Dock = DockStyle.Top;
            slotsTitle.Height = 30;

            var slotsGrid = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 4,
                RowCount = 3,
                Padding = new Padding(0, 8, 0, 8)
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
                Height = 42
            };
            btnNewMaint.Click += delegate { ConfirmToggleSpecial("maintenance_reset_tag", Loc.T("Reset Periodic Maintenance Counter", "تصفير عداد الصيانة الدورية")); };

            slotsCard.Controls.Add(slotsGrid);
            slotsCard.Controls.Add(slotsTitle);
            slotsCard.Controls.Add(btnNewMaint);

            split.Controls.Add(holdCard, 0, 0);
            split.Controls.Add(slotsCard, 1, 0);
            _controlsContainer.Controls.Add(split);

            Controls.Add(_controlsContainer);
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

        void StartMomentary(string controlKey, string label)
        {
            if (_activeMomentaryKey != null && _activeMomentaryKey != controlKey)
                ReleaseMomentary(_activeMomentaryKey, Loc.T("Switching lane", "تبديل مسار"));

            _activeMomentaryKey = controlKey;
            _lblStatus.Text = Loc.T("🟡 Momentary active (Hold): ", "🟡 تشغيل لحظي نشط (Momentary): ") + label + " (" + controlKey + " = 1)";
            _lblStatus.ForeColor = Theme.Amber;

            string keyCopy = controlKey;
            ThreadPool.QueueUserWorkItem(delegate
            {
                ParkState.Instance.SendManualControl(keyCopy, true);
            });
        }

        void ReleaseMomentary(string controlKey, string label)
        {
            if (_activeMomentaryKey != controlKey && controlKey != null) return;
            _activeMomentaryKey = null;
            _lblStatus.Text = Loc.T("🟢 Momentary released (ResetBit = 0): ", "🟢 تم إفلات الزر اللحظي (ResetBit = 0): ") + label;
            _lblStatus.ForeColor = Theme.Ok;

            string keyCopy = controlKey;
            string lblCopy = label;
            ParkState.Instance.RecordLocalAudit("MANUAL_MOMENTARY", keyCopy, lblCopy, Loc.UserDisplay(_shell.CurrentUser));
            ThreadPool.QueueUserWorkItem(delegate
            {
                ParkState.Instance.SendManualControl(keyCopy, false);
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
                info.Button.Text = "● " + info.BaseText + " [ON]";
            }
            else
            {
                info.Button.BaseColor = info.OffColor;
                info.Button.HoverColor = ControlPaint.Dark(info.OffColor, 0.08f);
                info.Button.BorderColor = Color.Empty;
                info.Button.Text = info.BaseText;
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
            bool acceptManualState = isStopper && HasAnyActiveStopper();

            if (active)
            {
                string extra = isStopper ? " + Accept_action_manual (M0.4 = 1)" : "";
                _lblStatus.Text = Loc.T("🟢 Toggled ON (SetBit = 1): ", "🟢 تم التشغيل (Toggle ON = 1): ") + label + " (" + controlKey + ")" + extra;
                _lblStatus.ForeColor = Theme.Ok;
            }
            else
            {
                string extra = isStopper ? (" + Accept_action_manual (M0.4 = " + (acceptManualState ? "1" : "0") + ")") : "";
                _lblStatus.Text = Loc.T("⚪ Toggled OFF (ResetBit = 0): ", "⚪ تم الإيقاف (Toggle OFF = 0): ") + label + " (" + controlKey + ")" + extra;
                _lblStatus.ForeColor = Theme.Ink;
            }

            string keyCopy = controlKey;
            string lblCopy = label;
            bool stateCopy = active;
            bool sendAcceptManual = isStopper;
            bool acceptStateCopy = acceptManualState;
            ParkState.Instance.RecordLocalAudit(stateCopy ? "MANUAL_TOGGLE_ON" : "MANUAL_TOGGLE_OFF", keyCopy, lblCopy, Loc.UserDisplay(_shell.CurrentUser));
            ThreadPool.QueueUserWorkItem(delegate
            {
                ParkState.Instance.SendManualControl(keyCopy, stateCopy);
                if (sendAcceptManual)
                    ParkState.Instance.SendPlcWrite("M0.4", acceptStateCopy ? 1 : 0, 0);
            });
        }

        void ReleaseAllOutputs(string reason)
        {
            bool allowWallWasOn = GetToggleState("allow_wall_tag");
            bool stopperWasOn = HasAnyActiveStopper();
            _activeMomentaryKey = null;
            ClearAllToggleVisuals();
            _lblStatus.Text = "🛑 " + reason;
            _lblStatus.ForeColor = Theme.Err;
            ParkState.Instance.RecordLocalAudit("MANUAL_STOP_ALL", "ALL_OUTPUTS", reason, Loc.UserDisplay(_shell.CurrentUser));
            ThreadPool.QueueUserWorkItem(delegate
            {
                // Atomic single-command release: clears all manual actuator bits + manual_action_tag (%M0.3) + accept_manual_tag (%M0.4)
                ParkState.Instance.SendManualControl("stop_all_manual", false);
                if (allowWallWasOn)
                    ParkState.Instance.SendManualControl("allow_wall_tag", false);
                if (stopperWasOn)
                    ParkState.Instance.SendPlcWrite("M0.4", 0, 0);
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
            _controlsContainer.Enabled = enableManual;
            ParkState.Instance.Sensors.ManualMode = enableManual;
            ParkState.Instance.Sensors.AutoMode = !enableManual;
            _lblStatus.Text = enableManual
                ? Loc.T("🟠 Manual Mode Active — Click any button to toggle ON/OFF.", "🟠 الوضع اليدوي مفعّل (Manual Mode Active) — اضغط على أي زر للتشغيل أو الإيقاف.")
                : Loc.T("🟢 Auto Mode Active — Manual controls locked.", "🟢 الوضع التلقائي مفعّل (Auto Mode Active) — تم قفل أزرار التحكم اليدوي.");
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
