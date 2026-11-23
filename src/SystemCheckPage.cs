using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

namespace AutoPark
{
    /// <summary>
    /// Comprehensive System Check Page — verifies ALL Program features (API, DB, Auth, MAC Whitelist,
    /// Alarms, Audit, PLC Config) AND ALL Machine hardware sensors (Safety Interlocks, 4-Lane Limit Switches,
    /// Raw S7-1200 Digital I/O IB0..IB3 & QB0..QB3, and live DB1/DB2/M tags) in one live diagnostic screen.
    /// </summary>
    class SystemCheckPage : Panel
    {
        readonly MainForm _shell;
        readonly System.Windows.Forms.Timer _autoTimer;
        readonly Label _lblSummary;
        readonly Label _lblPlcTestResult;
        readonly ModernButton _btnRunAll;
        readonly ModernButton _btnAuto;

        // Section 1: Program & Backend Feature Checks (8 rows)
        readonly Label[] _featStatus = new Label[8];
        readonly Label[] _featDetail = new Label[8];

        // Section 2: Machine Safety & Mode Sensors (10 badges)
        readonly Label[] _safetyBadges = new Label[10];

        // Section 3: 4-Lane Limit Switch & Protection Matrix
        readonly Label[,] _laneCells = new Label[4, 6]; // BTM, MID, TOP, MG_PROT, CHECK_LOC, FLOOR

        // Section 4: Raw Digital Inputs (I0.0..I2.7) & Outputs (Q0.0..Q2.7) + DB1/DB2 Live Bits
        readonly Label _lblRawBytes;
        readonly Label[] _inLeds = new Label[24];
        readonly Label[] _outLeds = new Label[24];
        readonly Label[] _dbBitChips;
        readonly string[] _dbBitKeys = new string[]
        {
            "auto_mode_tag", "manual_mode_tag", "manual_ok_tag", "man_pump_tag",
            "man_wall_tag", "man_up_tag", "man_down_tag", "man_cutoff_tag",
            "man_l1_tag", "man_l2_tag", "man_l3_tag", "man_l4_tag",
            "man_s1_tag", "man_s2_tag", "man_s3_tag", "man_s4_tag",
            "allow_wall_tag", "park_command_tag", "retrieve_command_tag", "step1_ok_tag",
            "step2_ok_tag", "reset_command_tag", "maintenance_due_tag", "heartbeat_tag"
        };
        readonly string[] _dbBitLabels = new string[]
        {
            "Auto_DB\nDB1,X0.3", "Manual_DB\nDB1,X0.5", "ManualOK\nDB1,X0.6", "Pump\nDB1,X1.1",
            "Wall Valve\nDB1,X1.2", "Lift UP\nDB1,X1.3", "Lift DOWN\nDB1,X1.4", "Cutoff\nDB1,X1.5",
            "Lane L1\nDB1,X1.6", "Lane L2\nDB1,X1.7", "Lane L3\nDB1,X2.0", "Lane L4\nDB1,X2.1",
            "Stop S1\nDB1,X2.2", "Stop S2\nDB1,X2.3", "Stop S3\nDB1,X2.4", "Stop S4\nDB1,X2.5",
            "Allow Wall\nM200.0", "Park_IN\nDB2,X6.3", "Park_OUT\nDB2,X6.4", "Step1_OK\nDB2,X6.0",
            "Step2_OK\nDB2,X6.1", "Reset\nDB2,X10.0", "Maint Due\nDB2,X10.1", "Clock 2Hz\nM60.3"
        };

        bool _running = false;
        bool _autoEnabled = true;
        string _lastReportText = "";

        public SystemCheckPage(MainForm shell)
        {
            _shell = shell;
            _dbBitChips = new Label[_dbBitKeys.Length];
            BackColor = Theme.Back;
            AutoScroll = true;

            DockStyle startDock = Loc.IsArabic ? DockStyle.Right : DockStyle.Left;
            DockStyle endDock = Loc.IsArabic ? DockStyle.Left : DockStyle.Right;

            // Scroll container
            var body = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
                Padding = new Padding(0, 0, 8, 24),
                BackColor = Color.Transparent
            };

            // ─── 1. Top Action Bar ───
            var topBar = new Panel { Height = 54, Width = 1140, Padding = new Padding(0, 2, 0, 6) };

            _btnRunAll = new ModernButton
            {
                Text = Loc.T("Run Full System Check", "فحص شامل للنظام والماكنة"),
                IconGlyph = Icons.Check,
                BaseColor = Theme.Primary,
                HoverColor = Theme.PrimaryHover
            };
            _btnRunAll.Click += delegate { RunFullCheckAsync(); };

            var btnTestPlc = new ModernButton
            {
                Text = Loc.T("Test PLC (192.168.0.27)", "فحص اتصال PLC"),
                IconGlyph = Icons.Plug,
                BaseColor = Theme.Blue,
                HoverColor = Color.FromArgb(29, 78, 216)
            };
            btnTestPlc.Click += delegate { RunPlcTestAsync(); };

            var btnResetAlarm = new ModernButton
            {
                Text = Loc.T("Reset Alarm Word", "تصفير Alarm Word"),
                IconGlyph = Icons.Shield,
                BaseColor = Theme.Amber,
                HoverColor = Color.FromArgb(180, 83, 9),
                Enabled = shell.CurrentUser.CanAcknowledgeAlarms
            };
            btnResetAlarm.Click += delegate { ResetAlarmWordAsync(); };

            _btnAuto = new ModernButton
            {
                Text = Loc.T("Auto Refresh: ON", "تحديث تلقائي: مفعل"),
                IconGlyph = Icons.Refresh,
                BaseColor = Theme.Ok,
                HoverColor = Color.FromArgb(21, 128, 61)
            };
            _btnAuto.Click += delegate
            {
                _autoEnabled = !_autoEnabled;
                _btnAuto.Text = _autoEnabled ? Loc.T("Auto Refresh: ON", "تحديث تلقائي: مفعل") : Loc.T("Auto Refresh: OFF", "تحديث تلقائي: متوقف");
                _btnAuto.BaseColor = _autoEnabled ? Theme.Ok : Theme.Muted;
                _btnAuto.Invalidate();
            };

            var btnExport = new ModernButton
            {
                Text = Loc.T("Export Report", "تصدير تقرير"),
                IconGlyph = Icons.Download,
                BaseColor = Theme.Ink,
                HoverColor = Color.FromArgb(51, 65, 85)
            };
            btnExport.Click += delegate { ExportReport(); };

            topBar.Controls.Add(Theme.Holder(btnExport, endDock, 145, new Padding(4, 2, 0, 2)));
            topBar.Controls.Add(Theme.Holder(_btnAuto, startDock, 165, new Padding(4, 2, 4, 2)));
            topBar.Controls.Add(Theme.Holder(btnResetAlarm, startDock, 170, new Padding(4, 2, 4, 2)));
            topBar.Controls.Add(Theme.Holder(btnTestPlc, startDock, 190, new Padding(4, 2, 4, 2)));
            topBar.Controls.Add(Theme.Holder(_btnRunAll, startDock, 205, new Padding(0, 2, 4, 2)));
            body.Controls.Add(topBar);

            // Summary Status Banner
            var bannerCard = new Card { Width = 1140, Height = 64, Padding = new Padding(16, 10, 16, 10), Margin = new Padding(0, 2, 0, 10) };
            _lblSummary = Theme.Label(Loc.T("Running complete program & machine self-check...", "جاري تنفيذ الفحص الشامل لجميع ميزات البرنامج وحساسات الماكنة..."), Theme.Bold(10.5f), Theme.Primary);
            _lblSummary.Dock = DockStyle.Top;
            _lblSummary.Height = 22;
            _lblPlcTestResult = Theme.Label(Loc.T("Server: " + ParkState.Instance.ApiBaseUrl, "الخادم: " + ParkState.Instance.ApiBaseUrl), Theme.F(9.2f), Theme.Muted);
            _lblPlcTestResult.Dock = DockStyle.Fill;
            bannerCard.Controls.Add(_lblPlcTestResult);
            bannerCard.Controls.Add(_lblSummary);
            body.Controls.Add(bannerCard);

            // ─── 2. Card A: Program & Backend Features Self-Check ───
            var featCard = new Card { Width = 1140, Height = 338, Padding = new Padding(16, 12, 16, 12), Margin = new Padding(0, 0, 0, 10) };
            var featTitle = Theme.Label(
                Loc.T("1. Program & Server Features Check (API, Database, Auth, MAC Whitelist, Alarms, Audit, PLC Link)",
                      "1. فحص ميزات البرنامج والخادم (API، قاعدة البيانات، الصلاحيات، MAC، التنبيهات، السجل، رابط الـ PLC)"),
                Theme.Bold(10.8f), Theme.Ink);
            featTitle.Dock = DockStyle.Top;
            featTitle.Height = 28;

            var featGrid = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 4,
                RowCount = 9,
                CellBorderStyle = TableLayoutPanelCellBorderStyle.Single
            };
            featGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 26f));
            featGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 12f));
            featGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
            featGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 12f));
            for (int r = 0; r < 9; r++) featGrid.RowStyles.Add(new RowStyle(SizeType.Percent, 11.1f));

            AddHeaderCell(featGrid, 0, 0, Loc.T("Feature / Subsystem", "الميزة / القسم"));
            AddHeaderCell(featGrid, 1, 0, Loc.T("Status", "الحالة"));
            AddHeaderCell(featGrid, 2, 0, Loc.T("Live Check Details & Latency", "تفاصيل الفحص المباشر والزمن"));
            AddHeaderCell(featGrid, 3, 0, Loc.T("Action", "فتح"));

            string[] featNames = new string[]
            {
                Loc.T("API Server & Tunnel / LAN", "خادم API والاتصال الشبكي"),
                Loc.T("Authentication & Permissions", "تسجيل الدخول والصلاحيات"),
                Loc.T("PostgreSQL & 12 Parking Bays", "قاعدة البيانات والمصفات الـ 12"),
                Loc.T("MAC Address Access Control", "حماية عناوين MAC للأجهزة"),
                Loc.T("Industrial Alarms Engine", "محرك التنبيهات والأعطال"),
                Loc.T("Audit & Command History", "سجل الأوامر والتدقيق"),
                Loc.T("Siemens S7-1200 PLC Link", "اتصال متحكم Siemens S7-1200"),
                Loc.T("PLC Tag Map (DB1 / DB2 / M)", "خريطة عناوين الـ PLC (DB1/DB2/M)")
            };

            for (int i = 0; i < 8; i++)
            {
                var lblName = Theme.Label("  " + featNames[i], Theme.Semi(9.3f), Theme.Ink);
                lblName.Dock = DockStyle.Fill;
                featGrid.Controls.Add(lblName, 0, i + 1);

                var lblSt = new Label
                {
                    Text = "...",
                    Font = Theme.Bold(9f),
                    TextAlign = ContentAlignment.MiddleCenter,
                    Dock = DockStyle.Fill,
                    BackColor = Theme.Back,
                    ForeColor = Theme.Muted
                };
                _featStatus[i] = lblSt;
                featGrid.Controls.Add(lblSt, 1, i + 1);

                var lblDet = Theme.Label(Loc.T("Pending check...", "بانتظار الفحص..."), Theme.F(8.9f), Theme.Muted);
                lblDet.Dock = DockStyle.Fill;
                _featDetail[i] = lblDet;
                featGrid.Controls.Add(lblDet, 2, i + 1);

                var btnOpen = CreateQuickOpenButton(i);
                featGrid.Controls.Add(btnOpen, 3, i + 1);
            }

            featCard.Controls.Add(featGrid);
            featCard.Controls.Add(featTitle);
            body.Controls.Add(featCard);

            // ─── 3. Card B: Machine Safety & Mode Sensors (10 badges) ───
            var safetyCard = new Card { Width = 1140, Height = 192, Padding = new Padding(16, 12, 16, 12), Margin = new Padding(0, 0, 0, 10) };
            var safetyTitle = Theme.Label(
                Loc.T("2. Machine Safety Interlocks, Alarms & Operating Mode Sensors (Live S7-1200)",
                      "2. حساسات الأمان، الطوارئ، الأعطال، ووضع التشغيل للماكنة (قراءة مباشرة من S7-1200)"),
                Theme.Bold(10.8f), Theme.Ink);
            safetyTitle.Dock = DockStyle.Top;
            safetyTitle.Height = 28;

            var safetyGrid = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 5,
                RowCount = 2,
                Padding = new Padding(0, 4, 0, 0)
            };
            for (int c = 0; c < 5; c++) safetyGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 20f));
            for (int r = 0; r < 2; r++) safetyGrid.RowStyles.Add(new RowStyle(SizeType.Percent, 50f));

            string[] safetyTitles = new string[]
            {
                Loc.T("Emergency Stop (%M50.0)", "إيقاف الطوارئ (%M50.0)"),
                Loc.T("Alarm Word (DB2.DBW8)", "كلمة الأعطال (DB2.DBW8)"),
                Loc.T("Alarm Section (%MW50)", "سجل الأعطال (%MW50)"),
                Loc.T("Auto Mode (DB1.DBX0.3)", "الوضع التلقائي (Auto)"),
                Loc.T("Manual Mode (DB1.DBX0.5)", "الوضع اليدوي (Manual)"),
                Loc.T("ManualOK Gate (DB1.DBX0.6)", "سماح اليدوي (ManualOK)"),
                Loc.T("Photocell (PCELL_IN_1)", "حساس المدخل (Photocell)"),
                Loc.T("Obstacle Exist (%M3.3)", "وجود عائق (%M3.3)"),
                Loc.T("Stopper Fault (%M50.4)", "عطل Stopper (%M50.4)"),
                Loc.T("Lift Pos (%M50.5) / Maint", "تموضع المصعد / الصيانة")
            };

            for (int i = 0; i < 10; i++)
            {
                _safetyBadges[i] = MakeSensorCard(safetyGrid, i % 5, i / 5, safetyTitles[i]);
            }

            safetyCard.Controls.Add(safetyGrid);
            safetyCard.Controls.Add(safetyTitle);
            body.Controls.Add(safetyCard);

            // ─── 4. Card C: 4-Lane Limit Switches & Mechanical Protection Matrix ───
            var laneCard = new Card { Width = 1140, Height = 210, Padding = new Padding(16, 12, 16, 12), Margin = new Padding(0, 0, 0, 10) };
            var laneTitle = Theme.Label(
                Loc.T("3. 4-Lane × 3-Floor Limit Switches (LS_BTM / LS_MID / LS_TOP), MG_PROT & Location Check",
                      "3. مصفوفة حساسات الطوابق للمسارات الأربعة (Limit Switches) والحماية الميكانيكية وفحص الموقع"),
                Theme.Bold(10.8f), Theme.Ink);
            laneTitle.Dock = DockStyle.Top;
            laneTitle.Height = 28;

            var laneGrid = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 7,
                RowCount = 5,
                CellBorderStyle = TableLayoutPanelCellBorderStyle.Single
            };
            for (int c = 0; c < 7; c++) laneGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 14.28f));
            for (int r = 0; r < 5; r++) laneGrid.RowStyles.Add(new RowStyle(SizeType.Percent, 20f));

            AddHeaderCell(laneGrid, 0, 0, Loc.T("Lane", "المسار"));
            AddHeaderCell(laneGrid, 1, 0, "LS_BTM (P1)");
            AddHeaderCell(laneGrid, 2, 0, "LS_MID (P2)");
            AddHeaderCell(laneGrid, 3, 0, "LS_TOP (P3)");
            AddHeaderCell(laneGrid, 4, 0, "MG_PROT");
            AddHeaderCell(laneGrid, 5, 0, Loc.T("Check Loc (%M3.x)", "فحص الموقع"));
            AddHeaderCell(laneGrid, 6, 0, Loc.T("Current Floor", "الطابق الحالي"));

            for (int lane = 0; lane < 4; lane++)
            {
                var lblLane = Theme.Label(Loc.T("Lane " + (lane + 1) + " (L" + (lane + 1) + ")", "المسار " + (lane + 1) + " (L" + (lane + 1) + ")"), Theme.Bold(9.5f), Theme.Primary);
                lblLane.TextAlign = ContentAlignment.MiddleCenter;
                lblLane.Dock = DockStyle.Fill;
                laneGrid.Controls.Add(lblLane, 0, lane + 1);

                for (int col = 0; col < 6; col++)
                {
                    var cell = new Label
                    {
                        Text = "—",
                        Font = Theme.Bold(9f),
                        TextAlign = ContentAlignment.MiddleCenter,
                        Dock = DockStyle.Fill,
                        BackColor = Theme.Surface,
                        ForeColor = Theme.Muted
                    };
                    _laneCells[lane, col] = cell;
                    laneGrid.Controls.Add(cell, col + 1, lane + 1);
                }
            }

            laneCard.Controls.Add(laneGrid);
            laneCard.Controls.Add(laneTitle);
            body.Controls.Add(laneCard);

            // ─── 5. Card D: Raw PLC Digital I/O (IB0..IB3, QB0..QB3) & Live DB1/DB2 Bits ───
            var ioCard = new Card { Width = 1140, Height = 365, Padding = new Padding(16, 12, 16, 12), Margin = new Padding(0, 0, 0, 10) };
            var ioTitle = Theme.Label(
                Loc.T("4. Raw Siemens S7-1200 Digital Inputs (I0.0–I2.7), Outputs (Q0.0–Q2.7) & Live DB1/DB2 Control Bits",
                      "4. مداخل ومخارج الـ PLC الخام (I0.0–I2.7 و Q0.0–Q2.7) وبتات التحكم الحية (DB1 / DB2 / M)"),
                Theme.Bold(10.8f), Theme.Ink);
            ioTitle.Dock = DockStyle.Top;
            ioTitle.Height = 26;

            _lblRawBytes = Theme.Label("IB0=—  IB1=—  IB2=—  IB3=—   |   QB0=—  QB1=—  QB2=—  QB3=—   |   DB1=[—]   DB2=[—]", Theme.Semi(9f), Theme.Muted);
            _lblRawBytes.Dock = DockStyle.Top;
            _lblRawBytes.Height = 22;

            var ioBody = new Panel { Dock = DockStyle.Fill, Padding = new Padding(0, 4, 0, 0) };

            var inRow = BuildLedRow(Loc.T("Inputs (I0.0–I2.7):", "المداخل (I0.0–I2.7):"), "I", _inLeds);
            inRow.Dock = DockStyle.Top;
            inRow.Height = 52;

            var outRow = BuildLedRow(Loc.T("Outputs (Q0.0–Q2.7):", "المخارج (Q0.0–Q2.7):"), "Q", _outLeds);
            outRow.Dock = DockStyle.Top;
            outRow.Height = 52;

            var dbGridTitle = Theme.Label(Loc.T("Live Manual & Handshake Bits (ParkIO_Data DB1 / ParkDB DB2 / %M):", "بتات التحكم اليدوي والتشغيل التلقائي الحية (DB1 / DB2 / %M):"), Theme.Bold(9.3f), Theme.Ink);
            dbGridTitle.Dock = DockStyle.Top;
            dbGridTitle.Height = 24;

            var dbGrid = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 8,
                RowCount = 3,
                Padding = new Padding(0, 2, 0, 0)
            };
            for (int c = 0; c < 8; c++) dbGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 12.5f));
            for (int r = 0; r < 3; r++) dbGrid.RowStyles.Add(new RowStyle(SizeType.Percent, 33.3f));

            for (int i = 0; i < _dbBitKeys.Length; i++)
            {
                var chip = new Label
                {
                    Text = _dbBitLabels[i] + "\n—",
                    Font = Theme.Semi(8.2f),
                    TextAlign = ContentAlignment.MiddleCenter,
                    Dock = DockStyle.Fill,
                    Margin = new Padding(3),
                    BackColor = Theme.Back,
                    ForeColor = Theme.Muted,
                    BorderStyle = BorderStyle.FixedSingle
                };
                _dbBitChips[i] = chip;
                dbGrid.Controls.Add(chip, i % 8, i / 8);
            }

            ioBody.Controls.Add(dbGrid);
            ioBody.Controls.Add(dbGridTitle);
            ioBody.Controls.Add(outRow);
            ioBody.Controls.Add(inRow);

            ioCard.Controls.Add(ioBody);
            ioCard.Controls.Add(_lblRawBytes);
            ioCard.Controls.Add(ioTitle);
            body.Controls.Add(ioCard);

            Controls.Add(body);

            Resize += delegate
            {
                int w = Math.Max(920, ClientSize.Width - 28);
                topBar.Width = w;
                bannerCard.Width = w;
                featCard.Width = w;
                safetyCard.Width = w;
                laneCard.Width = w;
                ioCard.Width = w;
            };

            _autoTimer = new System.Windows.Forms.Timer { Interval = 3000 };
            _autoTimer.Tick += delegate
            {
                if (_autoEnabled && !_running && IsHandleCreated && Visible)
                {
                    RunFullCheckAsync();
                }
            };
            _autoTimer.Start();

            RunFullCheckAsync();
        }

        Control CreateQuickOpenButton(int index)
        {
            var btn = new Button
            {
                Text = Loc.T("Open", "فتح"),
                Font = Theme.Semi(8.5f),
                FlatStyle = FlatStyle.Flat,
                BackColor = Theme.SurfaceHover,
                ForeColor = Theme.Primary,
                Dock = DockStyle.Fill,
                Margin = new Padding(4, 3, 4, 3),
                Cursor = Cursors.Hand
            };
            btn.FlatAppearance.BorderColor = Theme.Border;
            btn.Click += delegate
            {
                switch (index)
                {
                    case 0:
                    case 7:
                        if (_shell.CurrentUser.IsAdmin)
                            _shell.Navigate(new PlcSettingsPage(_shell), Loc.T("Industrial PLC Integration Settings", "إعدادات الربط الصناعي للـ PLC"));
                        break;
                    case 2:
                        _shell.Navigate(new HomePage(_shell), Loc.T("Dashboard & Live Map", "لوحة التحكم والخريطة الحية"));
                        break;
                    case 3:
                        if (_shell.CurrentUser.IsAdmin)
                            _shell.Navigate(new DevicesManagementPage(_shell), Loc.T("MAC Address Devices", "إدارة أجهزة MAC"));
                        break;
                    case 4:
                        _shell.Navigate(new AlarmsPage(_shell), Loc.T("Industrial Alarms", "التنبيهات والأعطال"));
                        break;
                    case 5:
                        _shell.Navigate(new CommandsHistoryPage(_shell), Loc.T("Commands & Audit Log", "سجل الأوامر والتدقيق"));
                        break;
                    case 6:
                        _shell.Navigate(new SensorMonitorPage(_shell), Loc.T("Live Sensor Monitor", "مراقبة الحساسات الحية"));
                        break;
                    default:
                        RunFullCheckAsync();
                        break;
                }
            };
            return btn;
        }

        Panel BuildLedRow(string title, string prefix, Label[] targets)
        {
            var wrap = new Panel { Padding = new Padding(0, 2, 0, 2) };
            var lbl = Theme.Label(title, Theme.Bold(8.8f), Theme.Ink);
            lbl.Dock = DockStyle.Top;
            lbl.Height = 18;

            var grid = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 24, RowCount = 1 };
            for (int i = 0; i < 24; i++)
            {
                grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f / 24f));
                int byteIdx = i / 8;
                int bitIdx = i % 8;
                var led = new Label
                {
                    Text = prefix + byteIdx + "." + bitIdx,
                    Font = new Font("Segoe UI", 7.2f, FontStyle.Bold),
                    TextAlign = ContentAlignment.MiddleCenter,
                    Dock = DockStyle.Fill,
                    Margin = new Padding(1),
                    BackColor = Theme.Back,
                    ForeColor = Theme.Muted,
                    BorderStyle = BorderStyle.FixedSingle
                };
                targets[i] = led;
                grid.Controls.Add(led, i, 0);
            }
            wrap.Controls.Add(grid);
            wrap.Controls.Add(lbl);
            return wrap;
        }

        Label MakeSensorCard(TableLayoutPanel parent, int col, int row, string title)
        {
            var card = new Card { Dock = DockStyle.Fill, Padding = new Padding(8, 6, 8, 6), Margin = new Padding(3) };
            var lblT = Theme.Label(title, Theme.F(8.3f), Theme.Muted);
            lblT.Dock = DockStyle.Top;
            lblT.Height = 18;
            var lblV = Theme.Label("...", Theme.Bold(9.5f), Theme.Ink);
            lblV.Dock = DockStyle.Fill;
            lblV.TextAlign = ContentAlignment.MiddleCenter;
            card.Controls.Add(lblV);
            card.Controls.Add(lblT);
            parent.Controls.Add(card, col, row);
            return lblV;
        }

        void AddHeaderCell(TableLayoutPanel grid, int col, int row, string text)
        {
            var l = new Label
            {
                Text = text,
                Font = Theme.Bold(8.8f),
                ForeColor = Theme.Ink,
                BackColor = Theme.Back,
                TextAlign = ContentAlignment.MiddleCenter,
                Dock = DockStyle.Fill
            };
            grid.Controls.Add(l, col, row);
        }

        void RunFullCheckAsync()
        {
            if (_running) return;
            _running = true;
            ThreadPool.QueueUserWorkItem(delegate
            {
                var report = new StringBuilder();
                report.AppendLine("=== TECHNO Electrical.Jo — AutoPark Full System Check ===");
                report.AppendLine("Timestamp: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
                report.AppendLine("User: " + _shell.CurrentUser.Username + " (" + _shell.CurrentUser.Role + ")");

                var st = ParkState.Instance;
                var statuses = new string[8];
                var details = new string[8];

                // 1. API Health
                var sw = Stopwatch.StartNew();
                string healthJson = st.GetApiRaw("/health");
                sw.Stop();
                bool apiOk = healthJson != null && healthJson.Contains("\"ok\"");
                if (!apiOk)
                {
                    // Auto-try fallback tunnel/LAN once if disconnected
                    if (st.PingHealthUrl("http://192.168.0.30:3000/api/v1"))
                    {
                        st.ApiBaseUrl = "http://192.168.0.30:3000/api/v1";
                        healthJson = st.GetApiRaw("/health");
                        apiOk = healthJson != null && healthJson.Contains("\"ok\"");
                    }
                    else if (st.PingHealthUrl(AppSettings.FallbackTunnelApiUrl))
                    {
                        st.ApiBaseUrl = AppSettings.FallbackTunnelApiUrl;
                        healthJson = st.GetApiRaw("/health");
                        apiOk = healthJson != null && healthJson.Contains("\"ok\"");
                    }
                }
                statuses[0] = apiOk ? "PASS" : "FAIL";
                details[0] = apiOk
                    ? ("OK (" + sw.ElapsedMilliseconds + " ms) — " + st.ApiBaseUrl)
                    : ("Unreachable: " + st.ApiBaseUrl + " (" + ShortErr(healthJson) + ")");

                // 2. Auth & Permissions
                bool hasToken = !string.IsNullOrEmpty(st.BackendToken);
                if (apiOk && !hasToken)
                {
                    st.EnsureBackendRunningAndLogin(_shell.CurrentUser.Username, _shell.CurrentUser.Password);
                    hasToken = !string.IsNullOrEmpty(st.BackendToken);
                }
                statuses[1] = hasToken ? "PASS" : (apiOk ? "WARN" : "FAIL");
                details[1] = hasToken
                    ? (_shell.CurrentUser.FullName + " [" + _shell.CurrentUser.Role + "] — JWT Active")
                    : Loc.T("Local session only (no live server token)", "جلسة محلية فقط بدون رمز خادم");

                // 3. Database & 12 Parking Bays
                sw.Restart();
                string spacesJson = hasToken ? st.GetApiRaw("/parking/spaces") : "ERR:No token";
                sw.Stop();
                int bayCount = Regex.Matches(spacesJson ?? "", "\"spaceNumber\"\\s*:").Count;
                int availCount = Regex.Matches(spacesJson ?? "", "\"status\"\\s*:\\s*\"AVAILABLE\"").Count;
                int occCount = Regex.Matches(spacesJson ?? "", "\"status\"\\s*:\\s*\"OCCUPIED\"").Count;
                statuses[2] = bayCount > 0 ? "PASS" : "FAIL";
                details[2] = bayCount > 0
                    ? string.Format("{0} Bays ({1} Available, {2} Occupied) — {3} ms", bayCount, availCount, occCount, sw.ElapsedMilliseconds)
                    : ("DB Query Failed: " + ShortErr(spacesJson));

                // 4. MAC Device Whitelist
                string devJson = hasToken ? st.GetApiRaw("/devices") : "ERR:No token";
                int devCount = Regex.Matches(devJson ?? "", "\"macAddress\"\\s*:").Count;
                bool devForbidden = (devJson ?? "").Contains("403");
                statuses[3] = devCount > 0 ? "PASS" : (devForbidden ? "PASS" : "WARN");
                details[3] = devCount > 0
                    ? (devCount + " Registered MAC device(s) synced with PostgreSQL")
                    : (devForbidden ? Loc.T("Restricted for current role (RBAC OK)", "مقيد حسب الصلاحية (RBAC سليم)") : ShortErr(devJson));

                // 5. Industrial Alarms Engine
                string alarmsJson = hasToken ? st.GetApiRaw("/alarms?limit=20") : "ERR:No token";
                bool alarmsOk = alarmsJson != null && !alarmsJson.StartsWith("ERR:");
                int activeAlarms = Regex.Matches(alarmsJson ?? "", "\"status\"\\s*:\\s*\"ACTIVE\"").Count;
                statuses[4] = !alarmsOk ? "WARN" : (activeAlarms > 0 ? "WARN" : "PASS");
                details[4] = alarmsOk
                    ? (activeAlarms == 0 ? Loc.T("0 Active Alarms — All clear", "0 تنبيهات نشطة — سليم") : (activeAlarms + " Active Alarm(s) require attention"))
                    : ShortErr(alarmsJson);

                // 6. Audit & Command History
                string auditJson = hasToken ? st.GetApiRaw("/audit?limit=5") : "ERR:No token";
                bool auditOk = auditJson != null && !auditJson.StartsWith("ERR:") && auditJson.Contains("items");
                string lastAction = ExtractJsonString(auditJson, "action");
                statuses[5] = auditOk ? "PASS" : "WARN";
                details[5] = auditOk
                    ? ("Audit Active — Last event: " + (string.IsNullOrEmpty(lastAction) ? "OK" : lastAction))
                    : ShortErr(auditJson);

                // 7. Siemens S7-1200 PLC Status & Heartbeat
                string sysJson = hasToken ? st.GetApiRaw("/system/status") : "ERR:No token";
                bool plcConn = ExtractJsonBool(sysJson, "plcConnected", false);
                string sysState = ExtractJsonString(sysJson, "state");
                string comm = ExtractJsonString(sysJson, "communication");
                string machState = ExtractJsonString(sysJson, "machineState");
                string sysMsg = ExtractJsonString(sysJson, "message");
                int hbAge = ExtractJsonInt(sysJson, "heartbeatAgeMs", -1);
                bool hbFresh = plcConn && comm == "OK" && hbAge >= 0 && hbAge < 15000;
                statuses[6] = hbFresh ? "PASS" : (plcConn ? "WARN" : "FAIL");
                details[6] = !string.IsNullOrEmpty(sysState)
                    ? string.Format("State={0} | Machine={1} | Comm={2} | HB={3}ms {4}",
                        sysState, machState, comm, hbAge, string.IsNullOrEmpty(sysMsg) ? "" : ("(" + sysMsg + ")"))
                    : ShortErr(sysJson);

                // 8. PLC Tag Map
                string cfgJson = hasToken ? st.GetApiRaw("/industrial/config") : "ERR:No token";
                int mappedCount = Regex.Matches(cfgJson ?? "", "\"address\"\\s*:\\s*\"(?:DB\\d+,|[IQM])").Count;
                string plcHost = ExtractJsonString(cfgJson, "host");
                int plcPort = ExtractJsonInt(cfgJson, "port", 102);
                statuses[7] = mappedCount >= 20 ? "PASS" : (mappedCount > 0 ? "WARN" : "FAIL");
                details[7] = mappedCount > 0
                    ? string.Format("{0} Live S7 addresses mapped -> {1}:{2}", mappedCount, plcHost, plcPort)
                    : ("No S7 addresses mapped (" + ShortErr(cfgJson) + ")");

                // Pull Live Sensors & Raw S7 I/O
                st.PullSensorsFromBackend();
                string liveS7Json = hasToken ? st.GetApiRaw("/industrial/s7/live") : "";

                for (int i = 0; i < 8; i++)
                    report.AppendLine(string.Format("[{0}] Check #{1}: {2}", statuses[i], i + 1, details[i]));
                report.AppendLine("Live S7 Snapshot: " + (liveS7Json != null && liveS7Json.Length > 300 ? liveS7Json.Substring(0, 300) + "..." : liveS7Json));
                _lastReportText = report.ToString();

                try
                {
                    if (IsHandleCreated && !IsDisposed)
                    {
                        BeginInvoke((Action)delegate
                        {
                            ApplyCheckResults(statuses, details, liveS7Json, hbFresh, plcConn, hbAge, sysState);
                            _running = false;
                        });
                    }
                    else
                    {
                        _running = false;
                    }
                }
                catch { _running = false; }
            });
        }

        void ApplyCheckResults(string[] statuses, string[] details, string liveS7Json, bool hbFresh, bool plcConn, int hbAge, string sysState)
        {
            int passCount = 0, warnCount = 0, failCount = 0;
            for (int i = 0; i < 8; i++)
            {
                string s = statuses[i] ?? "FAIL";
                if (s == "PASS") passCount++;
                else if (s == "WARN") warnCount++;
                else failCount++;

                _featStatus[i].Text = s;
                if (s == "PASS") { _featStatus[i].BackColor = Theme.OkSoft; _featStatus[i].ForeColor = Theme.Ok; }
                else if (s == "WARN") { _featStatus[i].BackColor = Theme.AmberSoft; _featStatus[i].ForeColor = Theme.Amber; }
                else { _featStatus[i].BackColor = Theme.ErrSoft; _featStatus[i].ForeColor = Theme.Err; }

                _featDetail[i].Text = "  " + (details[i] ?? "");
                _featDetail[i].ForeColor = s == "FAIL" ? Theme.Err : Theme.Ink;
            }

            int pct = (int)Math.Round((passCount / 8.0) * 100.0);
            _lblSummary.Text = string.Format(
                Loc.T("System Health: {0}%  —  {1} PASS  |  {2} WARN  |  {3} FAIL   (Updated {4})",
                      "صحة النظام: {0}%  —  {1} ناجح  |  {2} تحذير  |  {3} فشل   (تحديث {4})"),
                pct, passCount, warnCount, failCount, DateTime.Now.ToString("HH:mm:ss"));
            _lblSummary.ForeColor = failCount > 0 ? Theme.Err : (warnCount > 0 ? Theme.Amber : Theme.Ok);
            _lblPlcTestResult.Text = Loc.T("Active Server: ", "الخادم النشط: ") + ParkState.Instance.ApiBaseUrl +
                "   |   PLC: " + (hbFresh ? Loc.T("LIVE & SYNCED", "متصل ومباشر") : (plcConn ? ("STALE HB " + hbAge + "ms") : Loc.T("OFFLINE", "غير متصل")));

            // Section 2 & 3: Sensors Snapshot
            var sn = ParkState.Instance.Sensors;
            bool manualOk = ExtractJsonBool(liveS7Json, "manual_ok_tag", false);
            bool emgM500 = ExtractJsonBool(liveS7Json, "emergency_status_tag", sn.EmergencyPhysical || ParkState.Instance.EmergencyStop);

            SetBadge(_safetyBadges[0], emgM500 ? Loc.T("ACTIVE (E-STOP)", "مفعّل (طوارئ)") : Loc.T("CLEAR (OK)", "سليم"), !emgM500);
            SetBadge(_safetyBadges[1], sn.AlarmWord == 0 ? "0 (OK)" : (sn.AlarmWord + " (ALARM)"), sn.AlarmWord == 0);
            SetBadge(_safetyBadges[2], sn.AlarmSection == 0 ? "0 (OK)" : (sn.AlarmSection + " (FAULT)"), sn.AlarmSection == 0);
            SetBadge(_safetyBadges[3], sn.AutoMode ? "ON" : "OFF", sn.AutoMode, true);
            SetBadge(_safetyBadges[4], sn.ManualMode ? "ON" : "OFF", !sn.ManualMode, true);
            SetBadge(_safetyBadges[5], manualOk ? "READY (ON)" : "OFF", manualOk, true);
            SetBadge(_safetyBadges[6], sn.PhotocellClear ? Loc.T("CLEAR", "خالي") : Loc.T("BLOCKED", "عائق"), sn.PhotocellClear);
            SetBadge(_safetyBadges[7], sn.ObstacleExist ? Loc.T("OBSTACLE!", "يوجد عائق!") : Loc.T("NONE", "لا يوجد"), !sn.ObstacleExist);
            SetBadge(_safetyBadges[8], sn.StopperFault ? Loc.T("FAULT!", "عطل!") : Loc.T("OK", "سليم"), !sn.StopperFault);
            SetBadge(_safetyBadges[9], (sn.LiftInvalidPos ? "INVALID POS" : "POS OK") + (sn.MaintenanceDue ? " | MAINT DUE" : ""), !sn.LiftInvalidPos && !sn.MaintenanceDue);

            for (int lane = 0; lane < 4; lane++)
            {
                bool btm = sn.LimitSwitches[lane, 0];
                bool mid = sn.LimitSwitches[lane, 1];
                bool top = sn.LimitSwitches[lane, 2];
                bool mg = sn.MgProt[lane];
                bool chk = sn.CheckLocation[lane];
                int curFloor = sn.CurrentFloor[lane];

                SetCell(_laneCells[lane, 0], btm ? "ON" : "OFF", btm ? Theme.OkSoft : Theme.Surface, btm ? Theme.Ok : Theme.Muted);
                SetCell(_laneCells[lane, 1], mid ? "ON" : "OFF", mid ? Theme.OkSoft : Theme.Surface, mid ? Theme.Ok : Theme.Muted);
                SetCell(_laneCells[lane, 2], top ? "ON" : "OFF", top ? Theme.OkSoft : Theme.Surface, top ? Theme.Ok : Theme.Muted);
                SetCell(_laneCells[lane, 3], mg ? "OK" : "TRIPPED", mg ? Theme.OkSoft : Theme.ErrSoft, mg ? Theme.Ok : Theme.Err);
                SetCell(_laneCells[lane, 4], chk ? "OK" : "CHECK", chk ? Theme.BlueSoft : Theme.AmberSoft, chk ? Theme.Blue : Theme.Amber);
                string fl = curFloor == 3 ? "P3 (TOP)" : curFloor == 2 ? "P2 (MID)" : curFloor == 1 ? "P1 (BTM)" : "MOVING";
                SetCell(_laneCells[lane, 5], fl, Theme.PrimarySoft, Theme.Primary);
            }

            // Section 4: Raw I/O LEDs & DB1/DB2 Bits
            int ib0 = ExtractJsonInt(liveS7Json, "IB0", 0);
            int ib1 = ExtractJsonInt(liveS7Json, "IB1", 0);
            int ib2 = ExtractJsonInt(liveS7Json, "IB2", 0);
            int ib3 = ExtractJsonInt(liveS7Json, "IB3", 0);
            int qb0 = ExtractJsonInt(liveS7Json, "QB0", 0);
            int qb1 = ExtractJsonInt(liveS7Json, "QB1", 0);
            int qb2 = ExtractJsonInt(liveS7Json, "QB2", 0);
            int qb3 = ExtractJsonInt(liveS7Json, "QB3", 0);

            _lblRawBytes.Text = string.Format(
                "IB0={0}  IB1={1}  IB2={2}  IB3={3}   |   QB0={4}  QB1={5}  QB2={6}  QB3={7}   |   PLC Connected={8}",
                ib0, ib1, ib2, ib3, qb0, qb1, qb2, qb3, plcConn ? "YES" : "NO");

            UpdateLedBytes(_inLeds, new int[] { ib0, ib1, ib2 }, Theme.OkSoft, Theme.Ok);
            UpdateLedBytes(_outLeds, new int[] { qb0, qb1, qb2 }, Theme.BlueSoft, Theme.Blue);

            for (int i = 0; i < _dbBitKeys.Length; i++)
            {
                bool hasKey = liveS7Json != null && liveS7Json.Contains("\"" + _dbBitKeys[i] + "\"");
                bool val = ExtractJsonBool(liveS7Json, _dbBitKeys[i], false);
                _dbBitChips[i].Text = _dbBitLabels[i] + "\n" + (hasKey ? (val ? "ON" : "OFF") : "—");
                if (!hasKey)
                {
                    _dbBitChips[i].BackColor = Theme.Back;
                    _dbBitChips[i].ForeColor = Theme.Muted;
                }
                else if (val)
                {
                    _dbBitChips[i].BackColor = Theme.OkSoft;
                    _dbBitChips[i].ForeColor = Theme.Ok;
                }
                else
                {
                    _dbBitChips[i].BackColor = Theme.Surface;
                    _dbBitChips[i].ForeColor = Theme.Ink;
                }
            }
        }

        void UpdateLedBytes(Label[] leds, int[] bytes, Color onBg, Color onFg)
        {
            for (int b = 0; b < 3; b++)
            {
                int val = bytes[b] & 0xFF;
                for (int bit = 0; bit < 8; bit++)
                {
                    bool on = (val & (1 << bit)) != 0;
                    var led = leds[b * 8 + bit];
                    led.BackColor = on ? onBg : Theme.Back;
                    led.ForeColor = on ? onFg : Theme.Muted;
                }
            }
        }

        void SetBadge(Label lbl, string text, bool healthy, bool neutralMode = false)
        {
            lbl.Text = text;
            if (neutralMode)
            {
                lbl.ForeColor = healthy ? Theme.Primary : Theme.Amber;
                lbl.BackColor = healthy ? Theme.PrimarySoft : Theme.AmberSoft;
            }
            else
            {
                lbl.ForeColor = healthy ? Theme.Ok : Theme.Err;
                lbl.BackColor = healthy ? Theme.OkSoft : Theme.ErrSoft;
            }
        }

        void SetCell(Label lbl, string text, Color bg, Color fg)
        {
            lbl.Text = text;
            lbl.BackColor = bg;
            lbl.ForeColor = fg;
        }

        void RunPlcTestAsync()
        {
            _lblPlcTestResult.Text = Loc.T("Testing live S7-1200 connection to 192.168.0.27:102...", "جاري فحص الاتصال المباشر مع S7-1200...");
            ThreadPool.QueueUserWorkItem(delegate
            {
                string resp = ParkState.Instance.PostApiRaw("/industrial/config/test", "{}");
                bool ok = ExtractJsonBool(resp, "ok", false);
                string msg = ExtractJsonString(resp, "message");
                int lat = ExtractJsonInt(resp, "latencyMs", -1);
                if (string.IsNullOrEmpty(msg)) msg = ShortErr(resp);
                try
                {
                    if (IsHandleCreated && !IsDisposed)
                    {
                        BeginInvoke((Action)delegate
                        {
                            Loc.ShowMsg(
                                (ok ? "PLC Connected (" + lat + " ms):\n" : "PLC Connection Failed:\n") + msg,
                                (ok ? "تم الاتصال بالـ PLC بنجاح (" + lat + " ms):\n" : "فشل الاتصال بالـ PLC:\n") + msg,
                                "PLC Connection Test", "فحص اتصال PLC",
                                MessageBoxButtons.OK, ok ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
                            RunFullCheckAsync();
                        });
                    }
                }
                catch { }
            });
        }

        void ResetAlarmWordAsync()
        {
            var confirm = Loc.ShowMsg(
                "Reset latched PLC Alarm Word (DB2.DBW8 = 0, %M0.5 = false)?\nNote: If a physical Emergency Stop is still pressed, the PLC will re-latch it automatically.",
                "هل تريد تصفير سجل الأعطال المعلق (DB2.DBW8 = 0 و %M0.5 = false)؟\nملاحظة: إذا كان زر الطوارئ الفيزيائي مضغوطاً فسيعيد الـ PLC تفعيله تلقائياً.",
                "Reset PLC Alarm Word", "تصفير Alarm Word",
                MessageBoxButtons.YesNo, MessageBoxIcon.Question);
            if (confirm != DialogResult.Yes) return;

            ThreadPool.QueueUserWorkItem(delegate
            {
                var st = ParkState.Instance;
                string r1 = st.PostApiRaw("/industrial/s7/write", "{\"address\":\"M0.5\",\"value\":false}");
                string r2 = st.PostApiRaw("/industrial/s7/write", "{\"address\":\"DB2,W8\",\"value\":0}");
                try
                {
                    if (IsHandleCreated && !IsDisposed)
                    {
                        BeginInvoke((Action)delegate
                        {
                            bool ok = r2 != null && r2.Contains("\"ok\":true");
                            Loc.ShowMsg(
                                ok ? "Alarm Word reset sent to PLC." : ("Reset failed: " + ShortErr(r2)),
                                ok ? "تم إرسال أمر تصفير Alarm Word للـ PLC بنجاح." : ("فشل التصفير: " + ShortErr(r2)),
                                "PLC Reset", "إعادة ضبط الـ PLC",
                                MessageBoxButtons.OK, ok ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
                            RunFullCheckAsync();
                        });
                    }
                }
                catch { }
            });
        }

        void ExportReport()
        {
            try
            {
                string path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                    "AutoPark_SystemCheck_" + DateTime.Now.ToString("yyyyMMdd_HHmmss") + ".txt");
                File.WriteAllText(path, _lastReportText ?? "No report generated yet.", Encoding.UTF8);
                Loc.ShowMsg(
                    "System Check report saved to Desktop:\n" + path,
                    "تم حفظ تقرير الفحص الشامل على سطح المكتب:\n" + path,
                    "Report Exported", "تم تصدير التقرير",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                Loc.ShowMsg("Export failed: " + ex.Message, "فشل التصدير: " + ex.Message, "Error", "خطأ", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        static string ShortErr(string raw)
        {
            if (string.IsNullOrEmpty(raw)) return "No response";
            string s = raw.Replace("\r", " ").Replace("\n", " ").Trim();
            return s.Length > 120 ? s.Substring(0, 120) + "..." : s;
        }

        static string ExtractJsonString(string json, string key)
        {
            if (string.IsNullOrEmpty(json)) return "";
            var m = Regex.Match(json, "\"" + key + "\"\\s*:\\s*\"([^\"]*)\"");
            return m.Success ? m.Groups[1].Value : "";
        }

        static bool ExtractJsonBool(string json, string key, bool fallback)
        {
            if (string.IsNullOrEmpty(json)) return fallback;
            var m = Regex.Match(json, "\"" + key + "\"\\s*:\\s*(true|false)");
            return m.Success ? m.Groups[1].Value == "true" : fallback;
        }

        static int ExtractJsonInt(string json, string key, int fallback)
        {
            if (string.IsNullOrEmpty(json)) return fallback;
            var m = Regex.Match(json, "\"" + key + "\"\\s*:\\s*(-?\\d+)");
            int val;
            return (m.Success && int.TryParse(m.Groups[1].Value, out val)) ? val : fallback;
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing && _autoTimer != null)
            {
                _autoTimer.Stop();
                _autoTimer.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
