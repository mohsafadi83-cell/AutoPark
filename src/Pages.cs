using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Text;
using System.Windows.Forms;

namespace AutoPark
{
    class HomePage : Panel
    {
        readonly MainForm _shell;
        readonly KpiCard _kpiTotal;
        readonly KpiCard _kpiAvail;
        readonly KpiCard _kpiOcc;
        readonly KpiCard _kpiMoving;
        readonly KpiCard _kpiAlarms;
        readonly KpiCard _kpiStatus;
        readonly ModernButton _btnEStop;
        readonly Label _lblAutoRefresh;
        readonly Timer _autoRefreshTimer;
        readonly TableLayoutPanel _towersGrid;

        public HomePage(MainForm shell)
        {
            _shell = shell;
            BackColor = Theme.Back;
            AutoScroll = true;

            DockStyle startDock = Loc.IsArabic ? DockStyle.Right : DockStyle.Left;
            DockStyle endDock = Loc.IsArabic ? DockStyle.Left : DockStyle.Right;

            // 1. Top Navigation & Action Bar (wraps cleanly into 1-2 rows with zero clipping)
            var topBar = new Panel { Dock = DockStyle.Top, Height = 58, Padding = new Padding(0, 4, 0, 8) };
            var navFlow = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                FlowDirection = Loc.IsArabic ? FlowDirection.RightToLeft : FlowDirection.LeftToRight,
                WrapContents = true,
                AutoScroll = false,
                BackColor = Color.Transparent,
                Padding = new Padding(0)
            };

            var btnPark = MakeActionBtn(Loc.T("Park Vehicle", "إيداع (Park)"), Icons.Park, Theme.Primary, Theme.PrimaryHover, 118);
            btnPark.Enabled = shell.CurrentUser.CanControl;
            btnPark.Click += delegate { OpenOperationDialog("PARK", null); };

            var btnRetrieve = MakeActionBtn(Loc.T("Retrieve", "استرجاع (Retrieve)"), Icons.Car, Theme.Blue, Color.FromArgb(29, 78, 216), 116);
            btnRetrieve.Enabled = shell.CurrentUser.CanControl;
            btnRetrieve.Click += delegate { OpenOperationDialog("RETRIEVE", null); };

            // Main Emergency Stop / Recovery Button
            _btnEStop = MakeActionBtn(Loc.T("🔴 E-Stop", "🔴 إيقاف طارئ"), Icons.Shield, Theme.Err, Color.FromArgb(185, 28, 28), 144, false);
            _btnEStop.ForeColor = Color.White;
            _btnEStop.Enabled = shell.CurrentUser.CanControl;
            _btnEStop.Click += delegate
            {
                var stE = ParkState.Instance;
                if (!stE.EmergencyStop)
                {
                    stE.EmergencyStop = true;
                    stE.Sensors.EmergencyPhysical = true;
                    stE.EnsureAlarmActive("E_STOP_MANUAL", "EMERGENCY",
                        Loc.T("Emergency Stop pressed from main control panel", "تم ضغط زر إيقاف الطوارئ من لوحة التحكم الرئيسية"),
                        "OPERATOR_PANEL");
                    stE.RecordLocalAudit("ESTOP_ON", "SYSTEM",
                        Loc.T("Emergency Stop activated from dashboard", "تفعيل إيقاف الطوارئ من اللوحة الرئيسية"),
                        Loc.UserDisplay(_shell.CurrentUser));
                    System.Threading.ThreadPool.QueueUserWorkItem(delegate { stE.SendRecoveryAction("ESTOP_ON"); });
                    stE.NotifyChanged();
                }
                else
                {
                    using (var dlg = new EmergencyRecoveryDialog(_shell))
                    {
                        dlg.ShowDialog(_shell);
                    }
                    RefreshUI();
                }
            };

            bool isRestrictedEmployee = shell.CurrentUser.Role == "EMPLOYEE" || shell.CurrentUser.Role == "PARKING_ATTENDANT";

            var btnSystemCheck = MakeActionBtn(Loc.T("System Check", "فحص النظام"), Icons.Check, Theme.PrimarySoft, Theme.BlueSoft, 122, true);
            btnSystemCheck.Click += delegate { shell.Navigate(new SystemCheckPage(shell), Loc.T("Full System Check — All Sensors & Machine Features", "الفحص الشامل للنظام — جميع الحساسات وميزات البرنامج والماكنة")); };

            var btnClassicSim = MakeActionBtn(Loc.T("Classic Control", "كلاسيك كنترول"), Icons.Settings, Theme.AmberSoft, Theme.SurfaceHover, 132, true);
            btnClassicSim.ForeColor = Theme.Amber;
            btnClassicSim.Click += delegate { shell.Navigate(new ClassicControlSimulatorPage(shell), Loc.T("Classic Control Simulator — DOL / Fwd-Rev / Star-Delta / AutoPark", "محاكي الكلاسيك كنترول — DOL / عكس دوران / ستار دلتا / لوحة الماكنة")); };

            var btnVnc = MakeActionBtn(Loc.T("Direct HMI", "شاشة الماكنة"), Icons.Plug, Theme.BlueSoft, Theme.SurfaceHover, 114, true);
            btnVnc.ForeColor = Theme.Blue;
            btnVnc.Click += delegate { shell.Navigate(new VncViewerPage(shell), Loc.T("Standalone Direct HMI Console (No VNC Required)", "شاشة الماكنة المباشرة — تشغيل مستقل بدون VNC")); };

            var btnManual = MakeActionBtn(Loc.T("Manual & Sensors", "اليدوي والحساسات"), Icons.Lock, Theme.Surface, Theme.SurfaceHover, 142, true);
            btnManual.Enabled = shell.CurrentUser.CanMaintenance && !isRestrictedEmployee;
            btnManual.Click += delegate { shell.Navigate(new ManualMaintenancePage(shell), Loc.T("Manual Controls & Live Sensors", "التحكم اليدوي والحساسات الحية")); };

            var btnVehicles = MakeActionBtn(Loc.T("Vehicles", "المركبات"), Icons.Car, Theme.Surface, Theme.SurfaceHover, 96, true);
            btnVehicles.Enabled = !isRestrictedEmployee;
            btnVehicles.Click += delegate { shell.Navigate(new VehiclesPage(shell), Loc.T("Registered Vehicles Management", "إدارة المركبات المسجلة — الأردن")); };

            var btnAlarms = MakeActionBtn(Loc.T("Alarms", "التنبيهات"), Icons.Warning, Theme.Surface, Theme.SurfaceHover, 94, true);
            btnAlarms.Enabled = !isRestrictedEmployee;
            btnAlarms.Click += delegate { shell.Navigate(new AlarmsPage(shell), Loc.T("Industrial Alarms & Faults", "التنبيهات والأعطال الصناعية")); };

            var btnHistory = MakeActionBtn(Loc.T("History", "سجل الأوامر"), Icons.History, Theme.Surface, Theme.SurfaceHover, 96, true);
            btnHistory.Enabled = !isRestrictedEmployee;
            btnHistory.Click += delegate { shell.Navigate(new CommandsHistoryPage(shell), Loc.T("Industrial Commands & Audit Log", "سجل الأوامر الصناعية والتدقيق")); };

            var btnDevices = MakeActionBtn(Loc.T("MAC Devices", "أجهزة MAC"), Icons.User, Theme.Surface, Theme.SurfaceHover, 110, true);
            btnDevices.Enabled = shell.CurrentUser.IsAdmin;
            btnDevices.Click += delegate { shell.Navigate(new DevicesManagementPage(shell), Loc.T("Employee Mobile Devices & MAC Address Access Control", "إدارة هواتف الموظفين وعناوين MAC Address وإلغاء الصلاحية")); };

            var btnSettings = MakeActionBtn(Loc.T("PLC Settings", "إعدادات PLC"), Icons.Settings, Theme.Surface, Theme.SurfaceHover, 110, true);
            btnSettings.Enabled = shell.CurrentUser.IsAdmin;
            btnSettings.Click += delegate { shell.Navigate(new PlcSettingsPage(shell), Loc.T("Industrial PLC Integration Settings (settings.ini)", "إعدادات الربط الصناعي للمتحكم وعناوين الـ PLC (settings.ini)")); };

            Action<ModernButton, int> addNav = delegate (ModernButton b, int wBtn)
            {
                b.Width = wBtn;
                b.Height = 40;
                b.Margin = new Padding(0, 2, 6, 4);
                navFlow.Controls.Add(b);
            };

            addNav(btnPark, 118);
            addNav(btnRetrieve, 116);
            addNav(btnSystemCheck, 122);
            addNav(btnClassicSim, 132);
            addNav(btnVnc, 108);
            if (!isRestrictedEmployee)
            {
                addNav(btnManual, 142);
                addNav(btnVehicles, 96);
                addNav(btnAlarms, 94);
                addNav(btnHistory, 96);
                addNav(btnDevices, 110);
                addNav(btnSettings, 110);
            }

            topBar.Controls.Add(navFlow);
            topBar.Controls.Add(Theme.Holder(_btnEStop, endDock, 148, new Padding(4, 2, 4, 8)));

            // Auto-adjust topBar height if buttons wrap to a second row on smaller screens
            topBar.Resize += delegate
            {
                int maxBottom = 46;
                foreach (Control c in navFlow.Controls)
                {
                    if (c.Bottom + 6 > maxBottom) maxBottom = c.Bottom + 6;
                }
                int desired = Math.Max(54, Math.Min(108, maxBottom + 10));
                if (topBar.Height != desired) topBar.Height = desired;
            };

            // 2. KPI Strip (6 cards)
            var kpiStrip = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                Height = 92,
                ColumnCount = 6,
                RowCount = 1,
                Padding = new Padding(0, 4, 0, 8)
            };
            for (int i = 0; i < 6; i++)
                kpiStrip.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 16.66f));

            _kpiStatus = new KpiCard(Loc.T("PLC & System Status", "حالة النظام والـ PLC"), Theme.Ok);
            _kpiTotal = new KpiCard(Loc.T("Total Bays", "إجمالي المصفات"), Theme.Primary);
            _kpiAvail = new KpiCard(Loc.T("Available Bays", "المصفات المتاحة"), Theme.Ok);
            _kpiOcc = new KpiCard(Loc.T("Occupied Bays", "المصفات المشغولة"), Theme.Blue);
            _kpiMoving = new KpiCard(Loc.T("Moving Vehicles", "مركبات قيد الحركة"), Theme.Amber);
            _kpiAlarms = new KpiCard(Loc.T("Active Alarms", "التنبيهات النشطة"), Theme.Err);

            kpiStrip.Controls.Add(_kpiStatus, 0, 0);
            kpiStrip.Controls.Add(_kpiTotal, 1, 0);
            kpiStrip.Controls.Add(_kpiAvail, 2, 0);
            kpiStrip.Controls.Add(_kpiOcc, 3, 0);
            kpiStrip.Controls.Add(_kpiMoving, 4, 0);
            kpiStrip.Controls.Add(_kpiAlarms, 5, 0);

            // 3. Towers Map Card
            var mapSection = new Card { Dock = DockStyle.Fill, Padding = new Padding(18, 14, 18, 14) };

            var mapHeader = new Panel { Dock = DockStyle.Top, Height = 42 };
            var mapTitle = Theme.Label(
                Loc.T("Live Automated Parking Map (4 Lanes × 3 Floors: P3 Top → P2 Mid → P1 Bottom = 12 Bays):",
                      "خريطة الماكنة الفعلية (4 مسارات × 3 طوابق: P3 علوي → P2 أوسط → P1 سفلي = 12 مصف):"),
                Theme.Bold(11f), Theme.Ink);
            mapTitle.Dock = DockStyle.Fill;

            var simBtn = MakeActionBtn(Loc.T("PLC / E-Stop Sim", "محاكاة طوارئ / PLC"), Icons.Shield, Theme.AmberSoft, Theme.AmberSoft, 165, false);
            simBtn.ForeColor = Theme.Amber;
            simBtn.Click += delegate { ToggleSimulationMenu(simBtn); };

            _lblAutoRefresh = Theme.Label(
                Loc.T("🔄 Auto-Refresh every 15s — Last: ", "🔄 تحديث تلقائي كل 15 ثانية — آخر تحديث: ") + DateTime.Now.ToString("HH:mm:ss"),
                Theme.Semi(9f), Theme.Primary);
            _lblAutoRefresh.TextAlign = ContentAlignment.MiddleCenter;

            mapHeader.Controls.Add(mapTitle);
            mapHeader.Controls.Add(Theme.Holder(_lblAutoRefresh, endDock, 290, new Padding(6, 4, 6, 4)));
            mapHeader.Controls.Add(Theme.Holder(simBtn, endDock, 170, new Padding(0, 4, 0, 4)));

            // 4-Color Legend Bar
            var legendBar = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                Height = 32,
                FlowDirection = Loc.IsArabic ? FlowDirection.RightToLeft : FlowDirection.LeftToRight,
                Padding = new Padding(0, 4, 0, 4),
                BackColor = Color.Transparent
            };
            legendBar.Controls.Add(MakeLegendChip(Loc.T("🟢 Green: Empty Bay", "🟢 أخضر: مصف فارغ"), Theme.Ok, Theme.OkSoft));
            legendBar.Controls.Add(MakeLegendChip(Loc.T("🟡 Yellow: Your Personal Car", "🟡 أصفر: سيارتك الشخصية"), Color.FromArgb(180, 115, 0), Color.FromArgb(254, 249, 195)));
            legendBar.Controls.Add(MakeLegendChip(Loc.T("🟣 Purple: Moved by You (Other Car)", "🟣 نهدي: حرّكته لسيارة أخرى"), Theme.Purple, Color.FromArgb(243, 232, 255)));
            legendBar.Controls.Add(MakeLegendChip(Loc.T("🔴 Red: Colleague's Reserved Car", "🔴 أحمر: سيارات الزملاء المحجوزة"), Theme.Err, Theme.ErrSoft));

            _towersGrid = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 4,
                RowCount = 1,
                Padding = new Padding(0, 8, 0, 0),
                RightToLeft = RightToLeft.No
            };
            for (int c = 0; c < 4; c++) _towersGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 25f));
            _towersGrid.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));

            mapSection.Controls.Add(_towersGrid);
            mapSection.Controls.Add(legendBar);
            mapSection.Controls.Add(mapHeader);

            Controls.Add(mapSection);
            Controls.Add(kpiStrip);
            Controls.Add(topBar);

            // Continuous 15-second auto-refresh
            _autoRefreshTimer = new Timer { Interval = 15000 };
            _autoRefreshTimer.Tick += delegate
            {
                if (IsDisposed || !Visible) return;
                System.Threading.ThreadPool.QueueUserWorkItem(delegate
                {
                    if (ParkState.Instance.BackendConnected)
                    {
                        ParkState.Instance.PullSpacesFromDatabase();
                        ParkState.Instance.PullSensorsFromBackend();
                    }
                    if (!IsDisposed && IsHandleCreated)
                    {
                        try
                        {
                            BeginInvoke((Action)delegate
                            {
                                RefreshUI();
                                _shell.UpdateFooterStatus();
                            });
                        }
                        catch { }
                    }
                });
            };
            _autoRefreshTimer.Start();

            ParkState.Instance.Changed += RefreshUI;
            Disposed += delegate
            {
                _autoRefreshTimer.Stop();
                _autoRefreshTimer.Dispose();
                ParkState.Instance.Changed -= RefreshUI;
            };
            RefreshUI();
        }

        ModernButton MakeActionBtn(string text, string icon, Color bg, Color hover, int width, bool outline = false)
        {
            var b = new ModernButton
            {
                Text = text,
                IconGlyph = icon,
                IconSize = 10.5f,
                Font = Theme.Semi(9.5f),
                BaseColor = bg,
                HoverColor = hover,
                PressColor = hover,
                Width = width
            };
            if (outline)
            {
                b.BorderColor = Theme.Border;
                b.ForeColor = Theme.Ink;
            }
            return b;
        }

        void ToggleSimulationMenu(Control anchor)
        {
            var menu = new ContextMenuStrip { RightToLeft = Loc.Rtl, Font = Theme.F(10f) };
            var st = ParkState.Instance;

            menu.Items.Add(
                st.EmergencyStop
                    ? Loc.T("✅ Clear Emergency Stop", "✅ إلغاء إيقاف الطوارئ (Clear E-Stop)")
                    : Loc.T("🔴 Trigger Emergency Stop", "🔴 تفعيل إيقاف الطوارئ (Emergency Stop)"),
                null, delegate
                {
                    st.EmergencyStop = !st.EmergencyStop;
                    if (st.EmergencyStop)
                    {
                        st.EnsureAlarmActive("PLC_E_STOP", "EMERGENCY",
                            Loc.T("Emergency Stop triggered in simulation", "تم تفعيل إيقاف الطوارئ في المحاكاة"),
                            "SAFETY_PLC");
                    }
                    st.NotifyChanged();
                });

            menu.Items.Add(
                st.ControllerOffline
                    ? Loc.T("🟢 Reconnect PLC (Online)", "🟢 إعادة توصيل المتحكم الصناعي (Online)")
                    : Loc.T("⚫ Simulate PLC Offline", "⚫ محاكاة انقطاع اتصال PLC (Offline)"),
                null, delegate
                {
                    st.ControllerOffline = !st.ControllerOffline;
                    st.NotifyChanged();
                });

            menu.Items.Add(Loc.T("⚠ Trigger Entrance Sensor Alarm", "⚠ توليد تنبيه حساس البوابة (Sensor Alarm)"), null, delegate
            {
                st.EnsureAlarmActive("ENTRY_PHOTO_SENSOR", "WARNING",
                    Loc.T("Entrance photo-sensor detects an obstacle at gate", "حساس المدخل الضوئي يرصد عائقاً عند البوابة"),
                    "ENTRY_BAY");
                st.NotifyChanged();
            });

            menu.Show(anchor, new Point(0, anchor.Height));
        }

        public void RefreshUI()
        {
            if (IsDisposed) return;
            var st = ParkState.Instance;

            int avail = 0, occ = 0, moving = 0;
            foreach (var sp in st.Spaces)
            {
                if (sp.Status == "AVAILABLE") avail++;
                else if (sp.Status == "OCCUPIED") occ++;
                else if (sp.Status == "MOVING" || sp.Status == "RESERVED") moving++;
            }

            int activeAlarms = 0;
            foreach (var a in st.Alarms)
                if (a.Status != "RESOLVED") activeAlarms++;

            _kpiTotal.Value = st.Spaces.Count.ToString();
            _kpiAvail.Value = avail.ToString();
            _kpiOcc.Value = occ.ToString();
            _kpiMoving.Value = moving.ToString();
            _kpiAlarms.Value = activeAlarms.ToString();

            if (st.ControllerOffline)
                _kpiStatus.Value = Loc.T("⚫ Offline", "⚫ غير متصل");
            else if (st.EmergencyStop)
                _kpiStatus.Value = Loc.T("🔴 E-Stop", "🔴 طوارئ");
            else if (activeAlarms > 0)
                _kpiStatus.Value = Loc.T("🟡 Warning", "🟡 تحذير");
            else
                _kpiStatus.Value = Loc.T("🟢 Online", "🟢 متصل");

            if (_btnEStop != null)
            {
                if (st.EmergencyStop)
                {
                    _btnEStop.Text = Loc.T("🛠 Recovery", "🛠 استعادة الطوارئ");
                    _btnEStop.BaseColor = Color.FromArgb(22, 101, 52);
                    _btnEStop.HoverColor = Color.FromArgb(21, 128, 61);
                }
                else
                {
                    _btnEStop.Text = Loc.T("🔴 E-Stop", "🔴 إيقاف طارئ");
                    _btnEStop.BaseColor = Theme.Err;
                    _btnEStop.HoverColor = Color.FromArgb(185, 28, 28);
                }
                _btnEStop.Invalidate();
            }

            if (_lblAutoRefresh != null)
            {
                _lblAutoRefresh.Text = Loc.T("🔄 Auto-Refresh every 15s — Last: ", "🔄 تحديث تلقائي كل 15 ثانية — آخر تحديث: ") + DateTime.Now.ToString("HH:mm:ss");
            }

            BuildTowersMap();
        }

        void BuildTowersMap()
        {
            _towersGrid.SuspendLayout();
            _towersGrid.Controls.Clear();

            var spaces = ParkState.Instance.Spaces;
            var sensors = ParkState.Instance.Sensors;
            for (int lane = 1; lane <= 4; lane++)
            {
                var towerCard = new Card
                {
                    Dock = DockStyle.Fill,
                    FillColor = Theme.Back,
                    BorderColor = Theme.Border,
                    Margin = new Padding(6, 2, 6, 2),
                    Padding = new Padding(10, 8, 10, 8),
                    RightToLeft = Loc.Rtl
                };

                int curF = sensors.CurrentFloor[lane - 1];
                string floorBadge = curF == 3 ? "P3 (TOP)" : (curF == 2 ? "P2 (MID)" : (curF == 1 ? "P1 (BTM)" : Loc.T("Moving", "متحرك")));
                bool mgTripped = sensors.MgProtMapped[lane - 1] && sensors.MgProt[lane - 1];
                string mgIcon = mgTripped ? "🔴" : "🟢";
                var towerHeader = Theme.Label(
                    Loc.T("Lane " + lane + "  |  Lift: " + floorBadge + " " + mgIcon,
                          "المسار " + lane + " (Lane " + lane + ")  |  المصعد: " + floorBadge + " " + mgIcon),
                    Theme.Bold(9.8f), Theme.Primary);
                towerHeader.Dock = DockStyle.Top;
                towerHeader.Height = 26;

                var stackTable = new TableLayoutPanel
                {
                    Dock = DockStyle.Fill,
                    ColumnCount = 1,
                    RowCount = 3,
                    Padding = new Padding(0, 4, 0, 0)
                };
                for (int r = 0; r < 3; r++)
                    stackTable.RowStyles.Add(new RowStyle(SizeType.Percent, 33.33f));

                var laneSpaces = spaces.FindAll(s => s.ColumnNumber == lane);
                laneSpaces.Sort((a, b) => b.PositionInColumn.CompareTo(a.PositionInColumn));
                for (int r = 0; r < 3 && r < laneSpaces.Count; r++)
                {
                    stackTable.Controls.Add(CreateSpaceCard(laneSpaces[r]), 0, r);
                }

                towerCard.Controls.Add(stackTable);
                towerCard.Controls.Add(towerHeader);
                _towersGrid.Controls.Add(towerCard, lane - 1, 0);
            }

            _towersGrid.ResumeLayout();
        }

        static Control MakeLegendChip(string text, Color fg, Color bg)
        {
            return new Label
            {
                Text = "  " + text + "  ",
                AutoSize = true,
                Font = Theme.Bold(9f),
                ForeColor = fg,
                BackColor = bg,
                Padding = new Padding(6, 3, 6, 3),
                Margin = new Padding(6, 0, 0, 0)
            };
        }

        Control CreateSpaceCard(SpaceItem sp)
        {
            Color accent = Theme.Ok;
            Color cardFill = Color.FromArgb(240, 253, 244);
            string statusTxt = Loc.T("🟢 Available — Empty Bay", "🟢 متاح — مصف فارغ");

            string me = (_shell.CurrentUser.Username ?? "").ToLowerInvariant();
            string parkedBy = (sp.ParkedByUsername ?? "").ToLowerInvariant();
            bool parkedByMe = !string.IsNullOrEmpty(parkedBy) && parkedBy == me;

            if (!parkedByMe && !string.IsNullOrEmpty(sp.PlateNumber) && string.IsNullOrEmpty(parkedBy))
            {
                var vCheck = ParkState.Instance.Vehicles.Find(v => v.PlateNumber == sp.PlateNumber);
                if (vCheck != null && (vCheck.OwnerUsername ?? "").ToLowerInvariant() == me)
                    parkedByMe = true;
            }

            if (sp.Status == "OCCUPIED" || sp.Status == "RESERVED")
            {
                if (parkedByMe && !sp.IsOtherVehicle)
                {
                    accent = Color.FromArgb(202, 138, 4);
                    cardFill = Color.FromArgb(254, 249, 195);
                    statusTxt = Loc.T("🟡 Your Personal Car (Moved by You)", "🟡 سيارتك الشخصية (أنت حرّكت البارك)");
                }
                else if (parkedByMe && sp.IsOtherVehicle)
                {
                    accent = Theme.Purple;
                    cardFill = Color.FromArgb(243, 232, 255);
                    statusTxt = Loc.T("🟣 Other Car (Moved by You)", "🟣 سيارة أخرى (أنت حرّكت البارك)");
                }
                else
                {
                    accent = Theme.Err;
                    cardFill = Theme.ErrSoft;
                    statusTxt = Loc.T("🔴 Reserved — Colleague's Car", "🔴 محجوز — سيارة زميل");
                }
            }
            else if (sp.Status == "MOVING")
            {
                accent = Theme.Blue;
                cardFill = Theme.BlueSoft;
                statusTxt = Loc.T("🔄 Moving...", "🔄 قيد الحركة...");
            }
            else if (sp.Status == "ERROR")
            {
                accent = Theme.Err;
                cardFill = Theme.ErrSoft;
                statusTxt = Loc.T("⚠ Fault / Error", "⚠ خطأ (Error)");
            }

            var card = new Card
            {
                Dock = DockStyle.Fill,
                Margin = new Padding(2, 4, 2, 4),
                Padding = new Padding(12, 8, 16, 8),
                FillColor = cardFill,
                AccentColor = accent,
                Cursor = Cursors.Hand
            };

            var lblNum = Theme.Label(
                sp.SpaceNumber + "  (" + Loc.T("Floor P" + sp.PositionInColumn + " · Lane " + sp.ColumnNumber, "الطابق P" + sp.PositionInColumn + " · المسار " + sp.ColumnNumber) + ")",
                Theme.Bold(10.2f), Theme.Ink);
            lblNum.Dock = DockStyle.Top;
            lblNum.Height = 24;

            var lblStatus = Theme.Label(statusTxt, Theme.Semi(9.3f), accent);
            lblStatus.Dock = DockStyle.Top;
            lblStatus.Height = 22;

            string plateInfo = string.IsNullOrEmpty(sp.PlateNumber)
                ? Loc.T("No vehicle (Click to Park)", "لا توجد مركبة (اضغط لإيداع مركبة)")
                : "🚗 " + Loc.T("Plate: ", "اللوحة: ") + sp.PlateNumber + (string.IsNullOrEmpty(sp.OwnerName) ? "" : " — " + sp.OwnerName);

            var lblPlate = Theme.Label(plateInfo, Theme.Bold(9.8f), string.IsNullOrEmpty(sp.PlateNumber) ? Theme.Muted : Theme.Ink);
            lblPlate.Dock = DockStyle.Fill;

            EventHandler onClick = delegate
            {
                if (!_shell.CurrentUser.CanControl)
                {
                    Loc.ShowMsg("Your account is Read-Only.", "حسابك بوضع القراءة فقط (Read Only).", "Notice", "تنبيه", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                if (sp.Status == "AVAILABLE") OpenOperationDialog("PARK", sp);
                else if (sp.Status == "OCCUPIED") OpenOperationDialog("RETRIEVE", sp);
            };

            card.Click += onClick;
            lblNum.Click += onClick;
            lblStatus.Click += onClick;
            lblPlate.Click += onClick;

            card.Controls.Add(lblPlate);
            card.Controls.Add(lblStatus);
            card.Controls.Add(lblNum);
            return card;
        }

        void OpenOperationDialog(string opType, SpaceItem targetSpace)
        {
            var st = ParkState.Instance;
            if (st.ControllerOffline || st.EmergencyStop || _shell.Settings.ReadOnlyMode)
            {
                string reasonEn = st.ControllerOffline ? "Industrial controller is offline."
                    : st.EmergencyStop ? "Emergency Stop is active!"
                    : "System is in Read-Only monitoring mode.";
                string reasonAr = st.ControllerOffline ? "المتحكم الصناعي غير متصل (Offline)."
                    : st.EmergencyStop ? "إيقاف الطوارئ (Emergency Stop) مفعّل حالياً!"
                    : "النظام في وضع المراقبة فقط (Read-Only).";
                Loc.ShowMsg(
                    "Operation blocked for industrial safety:\n" + reasonEn,
                    "لا يمكن تنفيذ الأمر حالياً للأمان الصناعي:\n" + reasonAr,
                    "Safety Interlock", "حماية الأمان الصناعي",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            using (var dlg = new ParkRetrieveDialog(_shell, opType, targetSpace))
            {
                dlg.ShowDialog(_shell);
            }
            RefreshUI();
        }
    }

    class ParkRetrieveDialog : Form
    {
        readonly MainForm _shell;
        readonly string _opType;
        readonly SpaceItem _targetSpace;
        readonly ComboBox _cmbVehicle;
        readonly TextBox _txtPlate;
        readonly RadioButton _radMyCar;
        readonly RadioButton _radOtherCar;
        readonly Label _lblStepStatus;
        readonly Label _lblElevatorPos;
        readonly ProgressBar _progress;
        readonly ModernButton _btnExecute;
        readonly ModernButton _btnCancelStep;
        readonly Timer _timer;
        readonly List<string> _dynamicSteps = new List<string>();
        readonly List<int> _stepFloors = new List<int>();
        int _stepIndex = 0;
        int _waitTicks = 0;
        DateTime _waitStartUtc = DateTime.MinValue;
        DateTime _pauseStartUtc = DateTime.MinValue;
        double _pausedTotalSec = 0;
        bool _cancelled = false;
        volatile bool _backendDispatched = false;
        volatile bool _sensorPollInFlight = false;
        bool _timerPaused = false;
        ModernButton _btnPauseTimer;
        ModernButton _btnReturnGround;
        SpaceItem _chosenSpace;
        string _chosenPlate;
        CommandRecord _activeCmd;

        public ParkRetrieveDialog(MainForm shell, string opType, SpaceItem preselectedSpace)
        {
            _shell = shell;
            _opType = opType;
            _targetSpace = preselectedSpace;

            Theme.PrepareForm(this);
            Text = opType == "PARK"
                ? Loc.T("Park Vehicle Request (2-Step PLC)", "طلب إيداع مركبة (Park Vehicle — 2-Step PLC)")
                : Loc.T("Retrieve Vehicle Request (2-Step PLC)", "طلب استرجاع مركبة (Retrieve Vehicle — 2-Step PLC)");
            ClientSize = new Size(640, 520);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;

            var card = new Card { Dock = DockStyle.Fill, Margin = new Padding(16), Padding = new Padding(22) };

            var title = Theme.Label(
                opType == "PARK"
                    ? Loc.T("Park Vehicle", "إيداع مركبة في المواقف الآلية") + (preselectedSpace != null ? " — " + preselectedSpace.SpaceNumber : "")
                    : Loc.T("Retrieve Vehicle", "استرجاع مركبة من المواقف الآلية") + (preselectedSpace != null ? " — " + preselectedSpace.SpaceNumber : ""),
                Theme.Bold(14.5f), Theme.Ink);
            title.SetBounds(22, 16, 560, 32);

            var lblSelect = Theme.Label(Loc.T("Select a registered vehicle (or enter plate number below):", "اختر المركبة المسجلة (أو أدخل رقم اللوحة الأردنية):"), Theme.Semi(10f), Theme.Ink);
            lblSelect.SetBounds(22, 56, 560, 24);

            _cmbVehicle = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Font = Theme.F(10.5f) };
            _cmbVehicle.SetBounds(22, 84, 560, 34);

            var st = ParkState.Instance;
            if (opType == "PARK")
            {
                foreach (var v in st.Vehicles)
                {
                    bool alreadyParked = st.Spaces.Exists(s => s.PlateNumber == v.PlateNumber && s.Status == "OCCUPIED");
                    if (!alreadyParked)
                        _cmbVehicle.Items.Add(v.PlateNumber + " — " + v.Brand + " " + v.Model + (string.IsNullOrEmpty(v.OwnerName) ? "" : " (" + v.OwnerName + ")"));
                }
            }
            else
            {
                foreach (var s in st.Spaces)
                {
                    if (s.Status == "OCCUPIED" && !string.IsNullOrEmpty(s.PlateNumber))
                    {
                        int idx = _cmbVehicle.Items.Add(s.PlateNumber + " — " + Loc.T("Bay ", "موجود في مصف ") + s.SpaceNumber + (string.IsNullOrEmpty(s.OwnerName) ? "" : " (" + s.OwnerName + ")"));
                        if (preselectedSpace != null && preselectedSpace.SpaceNumber == s.SpaceNumber)
                            _cmbVehicle.SelectedIndex = idx;
                    }
                }
            }
            if (_cmbVehicle.Items.Count > 0 && _cmbVehicle.SelectedIndex < 0) _cmbVehicle.SelectedIndex = 0;

            var lblManual = Theme.Label(Loc.T("Or enter plate number manually (e.g. 10-45821):", "أو أدخل رقم اللوحة الأردنية يدوياً (مثال: 10-45821):"), Theme.Semi(10f), Theme.Ink);
            lblManual.SetBounds(22, 128, 560, 24);

            _txtPlate = new TextBox { Font = Theme.F(11f) };
            _txtPlate.SetBounds(22, 154, 560, 32);
            if (preselectedSpace != null && !string.IsNullOrEmpty(preselectedSpace.PlateNumber))
                _txtPlate.Text = preselectedSpace.PlateNumber;

            _radMyCar = new RadioButton
            {
                Text = Loc.T("🟡 My Personal Car (Yellow)", "🟡 سيارتي الشخصية (أصفر)"),
                Checked = true,
                AutoSize = true,
                Font = Theme.Bold(9.5f),
                ForeColor = Color.FromArgb(161, 98, 7),
                Visible = (opType == "PARK")
            };
            _radMyCar.SetBounds(Loc.IsArabic ? 310 : 22, 194, 260, 26);

            _radOtherCar = new RadioButton
            {
                Text = Loc.T("🟣 Other / Guest Car (Purple)", "🟣 سيارة أخرى / زائر أو زميل (نهدي)"),
                Checked = false,
                AutoSize = true,
                Font = Theme.Bold(9.5f),
                ForeColor = Theme.Purple,
                Visible = (opType == "PARK")
            };
            _radOtherCar.SetBounds(Loc.IsArabic ? 22 : 300, 194, 275, 26);

            _cmbVehicle.SelectedIndexChanged += delegate
            {
                if (_opType != "PARK" || _cmbVehicle.SelectedItem == null) return;
                string txt = _cmbVehicle.SelectedItem.ToString();
                int dash = txt.IndexOf(" — ");
                string pl = dash > 0 ? txt.Substring(0, dash).Trim() : txt;
                var vObj = ParkState.Instance.Vehicles.Find(v => v.PlateNumber == pl);
                if (vObj != null)
                {
                    bool mine = string.Equals(vObj.OwnerUsername, _shell.CurrentUser.Username, StringComparison.OrdinalIgnoreCase);
                    _radMyCar.Checked = mine;
                    _radOtherCar.Checked = !mine;
                }
            };
            if (opType == "PARK" && _cmbVehicle.SelectedIndex >= 0)
            {
                string txt0 = _cmbVehicle.SelectedItem.ToString();
                int d0 = txt0.IndexOf(" — ");
                string pl0 = d0 > 0 ? txt0.Substring(0, d0).Trim() : txt0;
                var v0 = st.Vehicles.Find(v => v.PlateNumber == pl0);
                if (v0 != null)
                {
                    bool mine0 = string.Equals(v0.OwnerUsername, _shell.CurrentUser.Username, StringComparison.OrdinalIgnoreCase);
                    _radMyCar.Checked = mine0;
                    _radOtherCar.Checked = !mine0;
                }
            }

            _lblElevatorPos = Theme.Label(Loc.T("Safety & Entrance Sensors: Ready for Pre-Check", "حالة حساسات الأمان والمدخل: جاهز للفحص المسبق (Pre-Check)"), Theme.Semi(9.5f), Theme.Ok);
            _lblElevatorPos.SetBounds(22, 228, 560, 24);

            _lblStepStatus = Theme.Label(Loc.T("Ready to run 2-Step PLC Sequence (Step 1: Get Park → Step 2: Return Park).", "جاهز لتنفيذ تسلسل الـ PLC من مرحلتين (Step 1: Get Park → Step 2: Return Park)."), Theme.Semi(10f), Theme.Primary);
            _lblStepStatus.SetBounds(22, 258, 560, 56);

            _progress = new ProgressBar { Minimum = 0, Maximum = 8, Value = 0 };
            _progress.SetBounds(22, 322, 560, 24);

            _btnExecute = new ModernButton
            {
                Text = opType == "PARK" ? Loc.T("Confirm & Start Safe Parking (PLC)", "تأكيد وبدء الإيداع الآمن (2-Step PLC)") : Loc.T("Confirm & Start Safe Retrieval (PLC)", "تأكيد وبدء الاسترجاع الآمن (2-Step PLC)"),
                IconGlyph = Icons.Check,
                BaseColor = opType == "PARK" ? Theme.Primary : Theme.Blue,
                HoverColor = opType == "PARK" ? Theme.PrimaryHover : Color.FromArgb(29, 78, 216)
            };
            _btnExecute.SetBounds(22, 368, 360, 46);
            _btnExecute.Click += StartWorkflow;

            _btnCancelStep = new ModernButton
            {
                Text = Loc.T("🛑 Cancel / E-STOP", "🛑 إلغاء / إيقاف طارئ (E-STOP)"),
                BaseColor = Theme.Err,
                HoverColor = Color.FromArgb(185, 28, 28),
                ForeColor = Color.White,
                Enabled = true
            };
            _btnCancelStep.SetBounds(394, 368, 188, 46);
            _btnCancelStep.Click += delegate
            {
                var ps = ParkState.Instance;
                _cancelled = true;
                _timer.Stop();
                ps.EmergencyStop = true;
                _lblStepStatus.ForeColor = Theme.Err;
                _lblStepStatus.Text = Loc.T("🛑 EMERGENCY STOP (E-STOP) ACTIVATED — All PLC motion halted immediately!", "🛑 تم تفعيل إيقاف الطوارئ (E-STOP) — توقفت جميع حركات الـ PLC فوراً!");
                if (_activeCmd != null)
                {
                    _activeCmd.Status = "CANCELLED";
                    _activeCmd.CompletedAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                }
                ps.RecordLocalAudit("ESTOP_CANCEL", _chosenSpace != null ? _chosenSpace.SpaceNumber : "LIFT",
                    Loc.T("Emergency Stop triggered from Park/Retrieve Cancel button", "تفعيل إيقاف الطوارئ من زر الإلغاء"), Loc.UserDisplay(_shell.CurrentUser));
                System.Threading.ThreadPool.QueueUserWorkItem(delegate { ps.SendRecoveryAction("ESTOP_ON"); });
                ps.NotifyChanged();
            };

            _btnReturnGround = new ModernButton
            {
                Text = Loc.T("⬇ Lower Lift to Home Position", "⬇ إرجاع المصعد للوضع الابتدائي (Home)"),
                BaseColor = Theme.Amber,
                HoverColor = Color.FromArgb(180, 83, 9),
                PressColor = Theme.Ok,
                ForeColor = Color.White,
                Enabled = true
            };
            _btnReturnGround.SetBounds(22, 424, 290, 40);
            _btnReturnGround.Click += delegate
            {
                var ps = ParkState.Instance;
                if (ps.IsPlcCommandBusy || !_btnReturnGround.Enabled) return;
                if (ps.EmergencyStop || ps.Sensors.EmergencyPhysical)
                {
                    Loc.ShowMsg("Cannot lower lift while Emergency Stop is active!", "لا يمكن إنزال المصعد أثناء تفعيل إيقاف الطوارئ!", "Safety", "أمان", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                _btnReturnGround.Enabled = false;
                _lblStepStatus.ForeColor = Theme.Amber;
                _lblStepStatus.Text = Loc.T("⬇ Lowering lift to Home Position (Step 2: M10.1=1, DB2,X5.6=0)...", "⬇ جاري إرجاع المصعد للوضع الابتدائي (المرحلة 2: M10.1=1)...");
                System.Threading.ThreadPool.QueueUserWorkItem(delegate
                {
                    // Exact TIA Portal Page 104 Step 2 sequence (sequential via _plcCommandLock; only write Auto_DB if not already ON):
                    if (!ps.Sensors.AutoMode)
                        ps.SendPlcWriteBool("DB1,X0.3", true, 0);
                    string r1 = ps.SendPlcWriteBool("M10.1", true, 0);     // SetBit(Park_IN_Step2_Start)
                    string r2 = ps.SendPlcWriteBool("DB2,X5.6", false, 0); // ResetBit(Park_Step2_Ready)
                    if (!IsDisposed && IsHandleCreated)
                    {
                        try
                        {
                            BeginInvoke((Action)delegate
                            {
                                _btnReturnGround.Enabled = true;
                                bool ok = (string.IsNullOrEmpty(r1) || !r1.StartsWith("ERR:")) && (string.IsNullOrEmpty(r2) || !r2.StartsWith("ERR:"));
                                _lblStepStatus.ForeColor = ok ? Theme.Ok : Theme.Err;
                                _lblStepStatus.Text = ok
                                    ? Loc.T("✅ Lift returning to Home Position (Step 2 M10.1=1 confirmed by PLC).", "✅ تم إرسال أمر إرجاع المصعد للوضع الابتدائي بنجاح (M10.1=1).")
                                    : Loc.T("⚠ Lower to Home failed: " + r1 + " " + r2, "⚠ تعذر إرجاع المصعد: " + r1 + " " + r2);
                            });
                        }
                        catch { }
                    }
                });
                ps.RecordLocalAudit("LOWER_TO_HOME", _chosenSpace != null ? _chosenSpace.SpaceNumber : "LIFT",
                    Loc.T("Lower lift to Home Position (M10.1=1, DB2,X5.6=0)", "إرجاع المصعد للوضع الابتدائي (M10.1=1, DB2,X5.6=0)"), Loc.UserDisplay(_shell.CurrentUser));
            };

            _btnPauseTimer = new ModernButton
            {
                Text = Loc.T("⏸ Pause", "⏸ إيقاف مؤقت"),
                BaseColor = Theme.Blue,
                HoverColor = Color.FromArgb(29, 78, 216),
                ForeColor = Color.White
            };
            _btnPauseTimer.SetBounds(318, 424, 130, 40);
            _btnPauseTimer.Click += delegate
            {
                _timerPaused = !_timerPaused;
                bool pausedNow = _timerPaused;
                if (pausedNow)
                {
                    _pauseStartUtc = DateTime.UtcNow;
                }
                else if (_pauseStartUtc != DateTime.MinValue)
                {
                    _pausedTotalSec += (DateTime.UtcNow - _pauseStartUtc).TotalSeconds;
                    _pauseStartUtc = DateTime.MinValue;
                }
                _btnPauseTimer.Text = pausedNow
                    ? Loc.T("▶ Resume", "▶ استئناف")
                    : Loc.T("⏸ Pause", "⏸ إيقاف مؤقت");
                _btnPauseTimer.BaseColor = pausedNow ? Theme.Ok : Theme.Blue;
                _lblStepStatus.ForeColor = pausedNow ? Theme.Amber : Theme.Ok;
                // Display-only timer pause: NEVER writes or interrupts PLC motion!
                _lblStepStatus.Text = pausedNow
                    ? Loc.T("⏸ Display timer paused (PLC unaffected).", "⏸ تم إيقاف عداد الوقت للعرض فقط (بدون التأثير على الـ PLC).")
                    : Loc.T("▶ Display timer resumed — reading live PLC sensors.", "▶ تم استئناف عداد الوقت — جاري عرض قراءات الحساسات الحية.");
            };

            var btnClose = new ModernButton
            {
                Text = Loc.T("Close", "إغلاق"),
                BaseColor = Theme.Back,
                HoverColor = Theme.Border,
                ForeColor = Theme.Ink,
                BorderColor = Theme.Border
            };
            btnClose.SetBounds(454, 424, 128, 40);
            btnClose.Click += delegate { Close(); };

            card.Controls.AddRange(new Control[] { title, lblSelect, _cmbVehicle, lblManual, _txtPlate, _radMyCar, _radOtherCar, _lblElevatorPos, _lblStepStatus, _progress, _btnExecute, _btnCancelStep, _btnReturnGround, _btnPauseTimer, btnClose });
            Controls.Add(card);

            _timer = new Timer { Interval = 750 };
            _timer.Tick += OnStepTick;
            FormClosing += delegate { _timer.Stop(); };
        }

        void CancelCurrentOperation(object sender, EventArgs e)
        {
            _cancelled = true;
            _timer.Stop();
            var st = ParkState.Instance;
            if (_chosenSpace != null)
            {
                _chosenSpace.Status = _opType == "PARK" ? "AVAILABLE" : "OCCUPIED";
                if (_opType == "PARK") _chosenSpace.PlateNumber = "";
            }
            if (_activeCmd != null)
            {
                _activeCmd.Status = "CANCELLED";
                _activeCmd.CompletedAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
            }
            string cancelTag;
            if (_shell.Settings != null && _shell.Settings.Tags.TryGetValue("cancel_step_tag", out cancelTag) && !string.IsNullOrEmpty(cancelTag))
            {
                string tagCopy = cancelTag;
                System.Threading.ThreadPool.QueueUserWorkItem(delegate { st.SendPlcWrite(tagCopy, 1, 350); });
            }
            st.RecordLocalAudit("CANCEL_STEP", _chosenSpace != null ? _chosenSpace.SpaceNumber : "PLC",
                Loc.T("Operation cancelled by operator (cancel_this_step)", "تم إلغاء العملية بواسطة المشغل (cancel_this_step)"),
                Loc.UserDisplay(_shell.CurrentUser));
            st.NotifyChanged();
            _lblStepStatus.ForeColor = Theme.Err;
            _lblStepStatus.Text = Loc.T("⚠ Operation cancelled — cancel_this_step sent to PLC.", "⚠ تم إلغاء العملية وإرسال إشارة cancel_this_step إلى الـ PLC.");
            _btnCancelStep.Enabled = false;
        }

        void StartWorkflow(object sender, EventArgs e)
        {
            var st = ParkState.Instance;
            var sens = st.Sensors;

            if (st.EmergencyStop || sens.EmergencyPhysical)
            {
                Loc.ShowMsg("⛔ Emergency Stop (EMRGENCY) is active! Resolve emergency first.", "⛔ إيقاف الطوارئ (EMRGENCY) مفعّل! يرجى معالجة الطوارئ أولاً من لوحة الاستعادة.", "Safety Blocked", "رفض الأمان", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
            if (!sens.PhotocellClear || sens.ObstacleExist)
            {
                Loc.ShowMsg("⛔ Obstacle detected at entrance (PCELL_IN_1) or lift shaft (Obstacle_exist)! Clear area first.", "⛔ تم رصد عائق في المدخل (PCELL_IN_1) أو داخل المصعد (Obstacle_exist)! يرجى إزالة العائق أولاً.", "Safety Sensor", "حساس الأمان", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            if (sens.LiftInvalidPos || sens.StopperFault)
            {
                Loc.ShowMsg("⛔ Lift position is invalid or mechanical stopper fault is active! Check Sensor Monitor.", "⛔ المصعد في موضع غير صالح أو يوجد عطل في Stopper! يرجى فحص شاشة مراقبة الحساسات.", "Position Fault", "عطل تموضع", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            string manual = _txtPlate.Text.Trim().ToUpperInvariant();
            if (!string.IsNullOrEmpty(manual)) _chosenPlate = manual;
            else if (_cmbVehicle.SelectedItem != null)
            {
                string item = _cmbVehicle.SelectedItem.ToString();
                int dash = item.IndexOf(" — ");
                _chosenPlate = dash > 0 ? item.Substring(0, dash).Trim() : item;
            }

            if (string.IsNullOrEmpty(_chosenPlate))
            {
                if (_targetSpace != null)
                {
                    _chosenPlate = !string.IsNullOrEmpty(_targetSpace.PlateNumber)
                        ? _targetSpace.PlateNumber
                        : ("BAY-" + _targetSpace.SpaceNumber);
                }
                else
                {
                    _chosenPlate = "AUTO-" + DateTime.Now.ToString("HHmmss");
                }
            }

            if (_opType == "PARK")
            {
                if (st.Spaces.Exists(s => s.PlateNumber == _chosenPlate && s.Status == "OCCUPIED"))
                {
                    Loc.ShowMsg("Vehicle " + _chosenPlate + " is already parked!", "المركبة " + _chosenPlate + " مصفوفة بالفعل داخل النظام!", "Rejected", "رفض الأمر", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                _chosenSpace = _targetSpace != null && _targetSpace.Status == "AVAILABLE"
                    ? _targetSpace
                    : st.Spaces.Find(s => s.Status == "AVAILABLE");

                if (_chosenSpace == null)
                {
                    Loc.ShowMsg("No available parking bays (all 12 bays are occupied).", "لا توجد أي مصفات متاحة حالياً (جميع المصفات الـ 12 مشغولة).", "Garage Full", "المواقف ممتلئة", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
            }
            else
            {
                _chosenSpace = _targetSpace != null && _targetSpace.Status == "OCCUPIED"
                    ? _targetSpace
                    : st.Spaces.Find(s => s.PlateNumber == _chosenPlate && s.Status == "OCCUPIED");

                if (_chosenSpace == null)
                {
                    Loc.ShowMsg("Vehicle " + _chosenPlate + " is not currently parked in any bay.", "المركبة " + _chosenPlate + " غير موجودة في أي مصف حالياً.", "Notice", "تنبيه", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
            }

            int lane = _chosenSpace.ColumnNumber;
            int targetUiFloor = _chosenSpace.PositionInColumn;
            int plcLevel = AppSettings.MapUiFloorToPlcLevel(targetUiFloor);

            if (lane >= 1 && lane <= 4 && sens.MgProtMapped[lane - 1] && sens.MgProt[lane - 1])
            {
                Loc.ShowMsg("⛔ Mechanical protection (PL" + lane + "_MG_PROT) on Lane " + lane + " is tripped!", "⛔ الحماية الميكانيكية (PL" + lane + "_MG_PROT) للمسار " + lane + " غير آمنة! يمنع التحريك.", "Mechanical Protection", "حماية ميكانيكية", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            int startFloor = (lane >= 1 && lane <= 4 && sens.CurrentFloor[lane - 1] >= 1) ? sens.CurrentFloor[lane - 1] : 3;
            string floorName = targetUiFloor == 3
                ? Loc.T("P3 (Top — PLC Level 3)", "P3 (العلوي — PLC Level 3)")
                : (targetUiFloor == 2 ? Loc.T("P2 (Mid — PLC Level 2)", "P2 (الأوسط — PLC Level 2)") : Loc.T("P1 (Bottom — PLC Level 1)", "P1 (السفلي — PLC Level 1)"));

            var confirm = Loc.ShowMsg(
                "Confirm Industrial PLC Operation (2-Step Sequence):\n\n" +
                "• Operation: " + (_opType == "PARK" ? "Park Vehicle (PARK IN)" : "Retrieve Vehicle (PARK OUT)") + "\n" +
                "• Plate Number: " + _chosenPlate + "\n" +
                "• Target Bay: " + _chosenSpace.SpaceNumber + " — Lane " + lane + " — " + floorName + "\n" +
                "• Lift Path: P" + startFloor + " → P" + targetUiFloor + "\n\nSend command to S7-1200 PLC?",
                "تأكيد العملية الصناعية (تسلسل الـ PLC من مرحلتين):\n\n" +
                "• نوع العملية: " + (_opType == "PARK" ? "إيداع مركبة (PARK IN)" : "استرجاع مركبة (PARK OUT)") + "\n" +
                "• رقم اللوحة: " + _chosenPlate + "\n" +
                "• المصف المستهدف: " + _chosenSpace.SpaceNumber + " — المسار " + lane + " — " + floorName + "\n" +
                "• موضع المصعد الحالي: P" + startFloor + " ← الهدف: P" + targetUiFloor + "\n\nهل تريد إرسال الأمر إلى المتحكم الصناعي (S7-1200 PLC)؟",
                "Safety Confirmation", "تأكيد الأمان قبل الإرسال",
                MessageBoxButtons.YesNo, MessageBoxIcon.Question);
            if (confirm != DialogResult.Yes) return;

            _dynamicSteps.Clear();
            _stepFloors.Clear();

            _dynamicSteps.Add(Loc.T("1) Safety Pre-Check Passed: PCELL_IN_1 OK + MG_PROT_L" + lane + " OK + EMRGENCY=OFF", "1) فحص الأمان المسبق ناجح: PCELL_IN_1 سليم + MG_PROT_L" + lane + " مؤمّن + EMRGENCY=OFF"));
            _stepFloors.Add(0);

            _dynamicSteps.Add(Loc.T("2) Step 1 (Get Park): Writing Lane=" + lane + ", Level=" + plcLevel + " + Auto_DB=1 + Step1_Start", "2) المرحلة 1 (Get Park): إرسال Lane_Number=" + lane + " و Level_Number=" + plcLevel + " + Auto_DB=1 + Step1_Start"));
            _stepFloors.Add(-1);

            if (startFloor < targetUiFloor)
            {
                for (int f = startFloor + 1; f <= targetUiFloor; f++)
                {
                    string lsTag = "PL" + lane + "_LS_" + (f == 3 ? "TOP" : (f == 2 ? "MID" : "BTM"));
                    _dynamicSteps.Add(Loc.T(
                        "⬆ Precision stop ascending at Floor P" + f + " — Limit Switch " + lsTag + " = ON",
                        "⬆ توقف دقيق أثناء الصعود عند الطابق P" + f + " — تأكيد الحساس " + lsTag + " = ON"));
                    _stepFloors.Add(f);
                }
            }
            else if (startFloor > targetUiFloor)
            {
                for (int f = startFloor - 1; f >= targetUiFloor; f--)
                {
                    string lsTag = "PL" + lane + "_LS_" + (f == 3 ? "TOP" : (f == 2 ? "MID" : "BTM"));
                    _dynamicSteps.Add(Loc.T(
                        "⬇ Precision stop descending at Floor P" + f + " — Limit Switch " + lsTag + " = ON",
                        "⬇ توقف دقيق أثناء النزول عند الطابق P" + f + " — تأكيد الحساس " + lsTag + " = ON"));
                    _stepFloors.Add(f);
                }
            }
            else
            {
                string lsTag = "PL" + lane + "_LS_" + (targetUiFloor == 3 ? "TOP" : (targetUiFloor == 2 ? "MID" : "BTM"));
                _dynamicSteps.Add(Loc.T(
                    "🎯 Lift aligned at Target Floor P" + targetUiFloor + " — " + lsTag + " = ON",
                    "🎯 المصعد في الطابق المستهدف P" + targetUiFloor + " — تأكيد الحساس " + lsTag + " = ON"));
                _stepFloors.Add(targetUiFloor);
            }

            _dynamicSteps.Add(_opType == "PARK"
                ? Loc.T("Step 2 (Return Park): Closing wall & returning platform (Park_Step2_OK → Step2_Start)...", "المرحلة 2 (Return Park): إغلاق الحاجز وإرجاع المنصة (Park_Step2_OK → Park_IN_Step2_Start)...")
                : Loc.T("Step 2 (Exit Ready): Securing gate & delivering vehicle to exit...", "المرحلة 2 (Exit Ready): تأمين البوابة وإخراج المركبة للاستلام..."));
            _stepFloors.Add(-2);

            _dynamicSteps.Add(_opType == "PARK"
                ? Loc.T("✅ Vehicle parked in " + _chosenSpace.SpaceNumber + " — confirmed by PLC & limit switches!", "✅ اكتمل إيداع المركبة في " + _chosenSpace.SpaceNumber + " بتأكيد الحساسات والـ PLC!")
                : Loc.T("✅ Vehicle ready for pickup at exit gate from " + _chosenSpace.SpaceNumber + "!", "✅ المركبة جاهزة للاستلام عند البوابة من " + _chosenSpace.SpaceNumber + "!"));
            _stepFloors.Add(0);

            _progress.Minimum = 0;
            _progress.Maximum = _dynamicSteps.Count;
            _progress.Value = 0;

            _btnExecute.Enabled = false;
            _btnCancelStep.Enabled = true;
            _cmbVehicle.Enabled = false;
            _txtPlate.Enabled = false;
            _cancelled = false;
            _waitTicks = 0;

            _chosenSpace.Status = "MOVING";
            if (_opType == "PARK") _chosenSpace.PlateNumber = _chosenPlate;

            _activeCmd = new CommandRecord
            {
                CommandId = "CMD-" + DateTime.Now.ToString("yyyyMMdd-HHmmss"),
                RequestNumber = "PR-" + DateTime.Now.ToString("HHmmss"),
                Type = _opType,
                PlateNumber = _chosenPlate,
                SpaceNumber = _chosenSpace.SpaceNumber,
                RequestedBy = Loc.UserDisplay(_shell.CurrentUser),
                Status = "SENT",
                CreatedAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
                CompletedAt = "—"
            };
            st.Commands.Insert(0, _activeCmd);

            string opCopy = _opType, plateCopy = _chosenPlate, targetSpaceCopy = _chosenSpace.SpaceNumber;
            int laneCopy = lane, levelCopy = plcLevel;
            bool isOtherCopy = (_opType == "PARK") && _radOtherCar.Checked;
            _backendDispatched = false;
            System.Threading.ThreadPool.QueueUserWorkItem(delegate
            {
                var ps = ParkState.Instance;
                bool dispatched = ps.PushOperationToBackend(opCopy, plateCopy, isOtherCopy, targetSpaceCopy);
                _backendDispatched = dispatched;

                // Wait 600ms so any older backend 350ms pulse finishes BEFORE we latch the clean TIA Portal 2-step sequence
                System.Threading.Thread.Sleep(600);

                // Clear any leftover manual bits & ensure pure Auto Mode
                ps.SendPlcWriteBool("DB1,X1.1", false, 0);   // Man_Pump = 0
                ps.SendPlcWriteBool("DB1,X1.2", false, 0);   // Man_Wall = 0
                ps.SendPlcWriteBool("DB1,X1.3", false, 0);   // Man_Up = 0
                ps.SendPlcWriteBool("DB1,X1.4", false, 0);   // Man_Down = 0
                ps.SendPlcWriteBool("DB1,X1.5", false, 0);   // Man_Cutoff = 0
                ps.SendPlcWriteBool("DB1,X2.6", false, 0);   // User_Logoff = 0
                ps.SendPlcWriteBool("DB1,X0.5", false, 0);   // Manual_DB = 0
                ps.SendPlcWriteBool("DB1,X2.7", false, 0);   // Sim Manual = 0
                ps.SendPlcWriteBool("M0.3", false, 0);       // manual_action = 0
                ps.SendPlcWriteBool("M0.4", false, 0);       // Accept_action_manual = 0
                ps.SendPlcWriteBool("DB1,X0.3", true, 0);    // Auto_DB = 1

                // Step A: Write Lane_Number (DB2,B3) & Level_Number (DB2,B4) + Mode bit (Park_IN / Park_OUT)
                ps.SendPlcWrite("DB2,B3", laneCopy, 0);      // ParkDB.Lane_Number (Byte @ 3.0)
                ps.SendPlcWrite("DB2,B4", levelCopy, 0);     // ParkDB.Level_Number (Byte @ 4.0)
                if (opCopy == "PARK")
                {
                    if (laneCopy >= 1 && laneCopy <= 4)
                        ps.SendPlcWriteBool("M3." + (3 + laneCopy), true, 0); // Lane1..4_check_location
                    ps.SendPlcWriteBool("DB2,X6.4", false, 0); // Park_OUT = 0
                    ps.SendPlcWriteBool("DB2,X6.3", true, 0);  // Park_IN = 1
                }
                else
                {
                    ps.SendPlcWriteBool("DB2,X6.3", false, 0); // Park_IN = 0
                    ps.SendPlcWriteBool("DB2,X6.4", true, 0);  // Park_OUT = 1
                }

                // Step B: Wait 250ms for PLC scan to latch Lane/Level/Mode, then execute exact TIA Portal Page 108 Step 1 start
                System.Threading.Thread.Sleep(250);
                ps.SendPlcWriteBool("M10.0", true, 0);       // SetBit(Park_IN_Step1_Start)
                ps.SendPlcWriteBool("DB2,X5.4", false, 0);   // ResetBit(Park_Step1_Ready)
            });
            st.NotifyChanged();

            _stepIndex = 0;
            _timer.Start();
        }

        void OnStepTick(object sender, EventArgs e)
        {
            if (_cancelled) { _timer.Stop(); return; }
            var st = ParkState.Instance;

            if (st.EmergencyStop || st.Sensors.EmergencyPhysical)
            {
                _timer.Stop();
                st.Sensors.EmergencyDuringMove = true;
                _activeCmd.Status = "FAILED";
                _activeCmd.CompletedAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                _lblStepStatus.ForeColor = Theme.Err;
                _lblStepStatus.Text = Loc.T("🔴 Emergency Stop during movement! Open Emergency Recovery panel.", "🔴 توقف طارئ أثناء الحركة! افتح لوحة استعادة الطوارئ.");
                _btnCancelStep.Enabled = false;
                st.NotifyChanged();
                return;
            }

            if (_timerPaused) return;

            if (_stepIndex < _dynamicSteps.Count)
            {
                int stepCode = _stepFloors[_stepIndex];
                int lane = _chosenSpace != null ? _chosenSpace.ColumnNumber : 1;

                if (stepCode >= 1 && stepCode <= 3 && st.Sensors.LiveConnected)
                {
                    // Non-blocking background PLC sensor poll so WinForms UI thread never freezes during lift travel
                    if (!_sensorPollInFlight)
                    {
                        _sensorPollInFlight = true;
                        System.Threading.ThreadPool.QueueUserWorkItem(delegate
                        {
                            try { st.PullSensorsFromBackend(); }
                            finally { _sensorPollInFlight = false; }
                        });
                    }
                    // Pure sensor-driven motion tracking: wait for real physical floor limit switch (NO artificial timeout!)
                    bool lsReached = st.Sensors.LimitSwitches[lane - 1, stepCode - 1];
                    if (_waitStartUtc == DateTime.MinValue)
                    {
                        _waitStartUtc = DateTime.UtcNow;
                        _pausedTotalSec = 0;
                    }
                    int elapsedSec = Math.Max(0, (int)Math.Floor((DateTime.UtcNow - _waitStartUtc).TotalSeconds - _pausedTotalSec));

                    if (!lsReached)
                    {
                        _waitTicks = elapsedSec;
                        _lblElevatorPos.ForeColor = Theme.Amber;
                        int curF = st.Sensors.CurrentFloor[lane - 1];
                        string curTxt = curF >= 1 && curF <= 3 ? ("P" + curF) : Loc.T("Moving", "متحرك");
                        string lsName = "PL" + lane + "_LS_" + (stepCode == 3 ? "TOP" : (stepCode == 2 ? "MID" : "BTM"));
                        _lblElevatorPos.Text = Loc.T(
                            "🔄 Live Motion (Lane " + lane + "): " + curTxt + " → P" + stepCode + " | Waiting for " + lsName + "=ON (" + elapsedSec + "s)",
                            "🔄 حركة المصعد الحية (المسار " + lane + "): " + curTxt + " ← P" + stepCode + " | بانتظار الحساس " + lsName + "=ON (" + elapsedSec + " ث)");
                        return;
                    }
                    else
                    {
                        _lblElevatorPos.ForeColor = Theme.Ok;
                        _lblElevatorPos.Text = Loc.T(
                            "🟢 Lift Position (Lane " + lane + "): Floor P" + stepCode + " confirmed ON!",
                            "🟢 تأكيد موضع المصعد الفعلي (المسار " + lane + "): الطابق P" + stepCode + " = ON!");
                    }
                }
                else if (stepCode >= 1 && stepCode <= 3)
                {
                    st.Sensors.SetSimulatedLaneFloor(lane, stepCode);
                    _lblElevatorPos.ForeColor = Theme.Ok;
                    _lblElevatorPos.Text = Loc.T("🟢 Lift Position (Lane " + lane + "): Floor P" + stepCode + " (PL" + lane + "_LS_" + (stepCode == 3 ? "TOP" : (stepCode == 2 ? "MID" : "BTM")) + " = ON)",
                        "🟢 موضع المصعد الحالي في المسار " + lane + ": الطابق P" + stepCode + " (PL" + lane + "_LS_" + (stepCode == 3 ? "TOP" : (stepCode == 2 ? "MID" : "BTM")) + " = ON)");
                }

                _waitTicks = 0;
                _waitStartUtc = DateTime.MinValue;
                _pausedTotalSec = 0;
                _lblStepStatus.Text = _dynamicSteps[_stepIndex];
                _progress.Value = _stepIndex + 1;

                if (stepCode == -1)
                {
                    _activeCmd.Status = "ACKNOWLEDGED";
                    if (!_backendDispatched && !st.BackendConnected)
                    {
                        string spotCode = _chosenSpace != null ? _chosenSpace.SpaceNumber : "";
                        string op = _opType;
                        var appSet = _shell.Settings;
                        System.Threading.ThreadPool.QueueUserWorkItem(delegate { ExecutePlcStep1Handshake(appSet, op, spotCode); });
                    }
                }
                else if (stepCode == -2)
                {
                    // NEVER auto-lower the lift! Hold here until driver exits & operator presses/holds Return Lift to Home.
                    _activeCmd.Status = "WAITING_DRIVER_CLEAR";
                    _lblStepStatus.ForeColor = Theme.Ok;
                    _lblStepStatus.Text = Loc.T(
                        "✅ Lift reached floor! Wait until driver exits & moves clear, then press '⬇ Lower Lift to Home Position'.",
                        "✅ وصل المصعد للطابق! انتظر حتى يخرج السائق ويبتعد عن المصعد، ثم اضغط '⬇ إرجاع المصعد للوضع الابتدائي (Home)'.");
                }

                _stepIndex++;
                return;
            }

            _timer.Stop();
            _btnCancelStep.Enabled = false;
            if (_opType == "PARK")
            {
                _chosenSpace.Status = "OCCUPIED";
                _chosenSpace.PlateNumber = _chosenPlate;
                _chosenSpace.ParkedByUsername = _shell.CurrentUser.Username;
                _chosenSpace.IsOtherVehicle = _radOtherCar.Checked;
                var veh = st.Vehicles.Find(v => v.PlateNumber == _chosenPlate);
                _chosenSpace.OwnerName = veh != null ? veh.OwnerName : Loc.UserDisplay(_shell.CurrentUser);
                if (veh == null)
                {
                    st.Vehicles.Add(new VehicleItem
                    {
                        PlateNumber = _chosenPlate,
                        Brand = Loc.T("Visitor Vehicle", "مركبة زائر"),
                        Model = "—",
                        Color = "—",
                        VehicleType = Loc.T("Sedan", "صالون"),
                        OwnerUsername = _radOtherCar.Checked ? "visitor" : _shell.CurrentUser.Username,
                        OwnerName = _radOtherCar.Checked ? Loc.T("Other / Guest", "سيارة أخرى / زائر") : Loc.UserDisplay(_shell.CurrentUser),
                        CreatedAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm")
                    });
                }
            }
            else
            {
                _chosenSpace.Status = "AVAILABLE";
                _chosenSpace.PlateNumber = "";
                _chosenSpace.OwnerName = "";
                _chosenSpace.ParkedByUsername = "";
                _chosenSpace.IsOtherVehicle = false;
            }
            _chosenSpace.UpdatedAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
            _activeCmd.Status = "COMPLETED";
            _activeCmd.CompletedAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
            st.NotifyChanged();

            // Keep dialog OPEN after arrival so operator can wait for driver to exit & press 'Lower Lift to Home Position'!
            _lblStepStatus.ForeColor = Theme.Ok;
            _lblStepStatus.Text = _opType == "PARK"
                ? Loc.T("✅ Deposit Completed (Bay " + _chosenSpace.SpaceNumber + ")! Wait for driver to clear lift, then press '⬇ Lower Lift to Home Position'.",
                        "✅ تم الإيداع بنجاح (المصف " + _chosenSpace.SpaceNumber + ")! بعد خروج السائق، اضغط زر '⬇ إرجاع المصعد للوضع الابتدائي (Home)'.")
                : Loc.T("✅ Vehicle ready at Bay " + _chosenSpace.SpaceNumber + "! After driver clears lift, press '⬇ Lower Lift to Home Position'.",
                        "✅ المركبة جاهزة في المصف " + _chosenSpace.SpaceNumber + "! بعد ابتعاد السائق، اضغط زر '⬇ إرجاع المصعد للوضع الابتدائي (Home)'.");
            _btnReturnGround.Enabled = true;
            _btnReturnGround.BaseColor = Theme.Ok;
            _btnReturnGround.Invalidate();
            Loc.ShowMsg(
                _opType == "PARK"
                    ? "Deposit Completed!\n\nVehicle (" + _chosenPlate + ") arrived at Bay " + _chosenSpace.SpaceNumber + ".\n\nIMPORTANT: Wait until the driver exits and moves clear, then press '⬇ Lower Lift to Home Position' on this screen to lower the lift."
                    : "Vehicle (" + _chosenPlate + ") arrived from Bay " + _chosenSpace.SpaceNumber + "!\n\nAfter clearing the lift, press '⬇ Lower Lift to Home Position' on this screen.",
                _opType == "PARK"
                    ? "تم الإيداع بنجاح (Deposit Completed)!\n\nوصلت المركبة (" + _chosenPlate + ") إلى المصف " + _chosenSpace.SpaceNumber + ".\n\nمهم: انتظر حتى يخرج السائق ويبتعد عن المصعد، ثم اضغط زر '⬇ إرجاع المصعد للوضع الابتدائي (Home)' في هذه الشاشة لإنزال المصعد."
                    : "وصلت المركبة (" + _chosenPlate + ") من المصف " + _chosenSpace.SpaceNumber + "!\n\nبعد خروج السائق، اضغط زر '⬇ إرجاع المصعد للوضع الابتدائي (Home)' في هذه الشاشة.",
                _opType == "PARK" ? "Deposit Completed" : "Operation Completed",
                _opType == "PARK" ? "تم الإيداع بنجاح" : "اكتملت العملية بنجاح",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        static void ExecutePlcStep1Handshake(AppSettings settings, string opType, string spotCode)
        {
            if (settings == null || string.IsNullOrEmpty(spotCode) || spotCode.Length < 3) return;
            try
            {
                int lane = 1, uiFloor = 1;
                int.TryParse(spotCode.Substring(1, 1), out lane);
                int.TryParse(spotCode.Substring(2, 1), out uiFloor);
                int plcLevel = AppSettings.MapUiFloorToPlcLevel(uiFloor);

                var st = ParkState.Instance;
                string tag;
                if (settings.Tags.TryGetValue("auto_mode_tag", out tag) && !string.IsNullOrEmpty(tag)) st.SendPlcWrite(tag, 1, 0);
                if (settings.Tags.TryGetValue("lane_number_tag", out tag) && !string.IsNullOrEmpty(tag)) st.SendPlcWrite(tag, lane, 0);
                if (settings.Tags.TryGetValue("level_number_tag", out tag) && !string.IsNullOrEmpty(tag)) st.SendPlcWrite(tag, plcLevel, 0);

                string opKey = opType == "PARK" ? "park_command_tag" : "retrieve_command_tag";
                if (settings.Tags.TryGetValue(opKey, out tag) && !string.IsNullOrEmpty(tag)) st.SendPlcWrite(tag, 1, 350);
                if (settings.Tags.TryGetValue("step1_ready_tag", out tag) && !string.IsNullOrEmpty(tag)) st.SendPlcWrite(tag, 1, 0);
                if (settings.Tags.TryGetValue("step1_start_tag", out tag) && !string.IsNullOrEmpty(tag)) st.SendPlcWrite(tag, 1, 350);
            }
            catch { }
        }

        static void ExecutePlcStep2Handshake(AppSettings settings)
        {
            if (settings == null) return;
            try
            {
                var st = ParkState.Instance;
                string tag;
                if (settings.Tags.TryGetValue("step2_ready_tag", out tag) && !string.IsNullOrEmpty(tag)) st.SendPlcWrite(tag, 1, 0);
                if (settings.Tags.TryGetValue("step2_start_tag", out tag) && !string.IsNullOrEmpty(tag)) st.SendPlcWrite(tag, 1, 350);
            }
            catch { }
        }

        public static void WriteEmergencyTag(string tagAddr, int val)
        {
            ParkState.Instance.SendPlcWrite(tagAddr, val, 0);
        }
    }

    class VehiclesPage : Panel
    {
        readonly DataGridView _grid;
        readonly TextBox _txtPlate, _txtBrand, _txtModel, _txtColor, _txtOwner;
        readonly ModernButton _btnAdd;
        string _editingPlate = null;

        public VehiclesPage(MainForm shell)
        {
            BackColor = Theme.Back;

            var topCard = new Card { Dock = DockStyle.Top, Height = 110, Padding = new Padding(16, 12, 16, 12), Margin = new Padding(0, 0, 0, 12) };
            var lbl = Theme.Label(Loc.T("Add New Vehicle:", "إضافة مركبة أردنية جديدة:"), Theme.Bold(11f), Theme.Ink);
            lbl.SetBounds(16, 10, 320, 24);

            _txtPlate = MakeInput(topCard, Loc.T("Plate Number (e.g. 18-64210)", "رقم اللوحة (مثال 18-64210)"), 16, 55, 170);
            _txtBrand = MakeInput(topCard, Loc.T("Brand (Toyota)", "العلامة (Toyota)"), 196, 55, 140);
            _txtModel = MakeInput(topCard, Loc.T("Model (Camry)", "الموديل (Camry)"), 346, 55, 140);
            _txtColor = MakeInput(topCard, Loc.T("Color (White)", "اللون (أبيض)"), 496, 55, 110);
            _txtOwner = MakeInput(topCard, Loc.T("Owner Name", "اسم المالك"), 616, 55, 190);

            _btnAdd = new ModernButton { Text = Loc.T("✚ Add Vehicle", "✚ إضافة المركبة"), IconGlyph = Icons.Check };
            _btnAdd.SetBounds(818, 52, 160, 38);
            _btnAdd.Click += delegate
            {
                string p = _txtPlate.Text.Trim().ToUpperInvariant();
                if (string.IsNullOrEmpty(p)) return;

                var st = ParkState.Instance;

                if (_editingPlate != null)
                {
                    var veh = st.Vehicles.Find(v => v.PlateNumber == _editingPlate);
                    if (veh != null)
                    {
                        bool isParked = st.Spaces.Exists(s => s.PlateNumber == _editingPlate && s.Status == "OCCUPIED");
                        if (isParked && p != _editingPlate.ToUpperInvariant())
                        {
                            Loc.ShowMsg("Cannot change plate number while the vehicle is parked inside the garage.", "لا يمكن تغيير رقم اللوحة أثناء وجود المركبة داخل المواقف.", "Warning", "تحذير", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                            _txtPlate.Text = _editingPlate;
                            return;
                        }
                        veh.PlateNumber = p;
                        veh.Brand = string.IsNullOrEmpty(_txtBrand.Text) ? veh.Brand : _txtBrand.Text.Trim();
                        veh.Model = string.IsNullOrEmpty(_txtModel.Text) ? veh.Model : _txtModel.Text.Trim();
                        veh.Color = string.IsNullOrEmpty(_txtColor.Text) ? veh.Color : _txtColor.Text.Trim();
                        veh.OwnerName = string.IsNullOrEmpty(_txtOwner.Text) ? veh.OwnerName : _txtOwner.Text.Trim();
                        if (!isParked && p != _editingPlate)
                        {
                            var sp2 = st.Spaces.Find(s => s.PlateNumber == _editingPlate);
                            if (sp2 != null) sp2.PlateNumber = p;
                        }
                        st.RecordLocalAudit("VEHICLE_EDIT", p, Loc.T("Edited vehicle (" + _editingPlate + " -> " + p + ")", "تعديل بيانات المركبة (" + _editingPlate + " -> " + p + ")"), Loc.UserDisplay(shell.CurrentUser));
                    }
                    _editingPlate = null;
                    _btnAdd.Text = Loc.T("✚ Add Vehicle", "✚ إضافة المركبة");
                    lbl.Text = Loc.T("Add New Vehicle:", "إضافة مركبة أردنية جديدة:");
                    _txtPlate.ReadOnly = false;
                    ClearInputs();
                }
                else
                {
                    if (st.Vehicles.Exists(v => v.PlateNumber == p))
                    {
                        Loc.ShowMsg("Vehicle " + p + " is already registered!", "المركبة برقم " + p + " مسجلة بالفعل في النظام!", "Duplicate", "تكرار", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        return;
                    }
                    st.Vehicles.Add(new VehicleItem
                    {
                        PlateNumber = p,
                        Brand = string.IsNullOrEmpty(_txtBrand.Text) ? "Toyota" : _txtBrand.Text.Trim(),
                        Model = string.IsNullOrEmpty(_txtModel.Text) ? "Camry" : _txtModel.Text.Trim(),
                        Color = string.IsNullOrEmpty(_txtColor.Text) ? Loc.T("White", "أبيض") : _txtColor.Text.Trim(),
                        VehicleType = Loc.T("Sedan", "صالون"),
                        OwnerUsername = shell.CurrentUser.Username,
                        OwnerName = string.IsNullOrEmpty(_txtOwner.Text) ? Loc.UserDisplay(shell.CurrentUser) : _txtOwner.Text.Trim(),
                        CreatedAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm")
                    });
                    string pCopy = p, bCopy = _txtBrand.Text.Trim(), mCopy = _txtModel.Text.Trim(), cCopy = _txtColor.Text.Trim();
                    System.Threading.ThreadPool.QueueUserWorkItem(delegate { ParkState.Instance.PushVehicleToBackend(pCopy, bCopy, mCopy, cCopy); });
                    ClearInputs();
                }

                ParkState.Instance.NotifyChanged();
                LoadRows();
            };

            topCard.Controls.Add(lbl);
            topCard.Controls.Add(_btnAdd);

            var gridCard = new Card { Dock = DockStyle.Fill, Padding = new Padding(12) };
            _grid = CreateStyledGrid();
            _grid.ReadOnly = false;
            _grid.Columns.Add("Plate", Loc.T("Plate Number", "رقم اللوحة الأردنية"));
            _grid.Columns.Add("Brand", Loc.T("Brand", "العلامة التجارية"));
            _grid.Columns.Add("Model", Loc.T("Model", "الموديل"));
            _grid.Columns.Add("Color", Loc.T("Color", "اللون"));
            _grid.Columns.Add("Owner", Loc.T("Owner Name", "اسم المالك"));
            _grid.Columns.Add("Space", Loc.T("Current Bay", "المصف الحالي"));
            _grid.Columns.Add("Created", Loc.T("Registered At", "تاريخ التسجيل"));

            var colEdit = new DataGridViewButtonColumn
            {
                Name = "Edit",
                HeaderText = Loc.T("Edit", "تعديل"),
                Text = Loc.T("✏ Edit", "✏ تعديل"),
                UseColumnTextForButtonValue = true,
                Width = 80,
                AutoSizeMode = DataGridViewAutoSizeColumnMode.None
            };
            _grid.Columns.Add(colEdit);

            var colDel = new DataGridViewButtonColumn
            {
                Name = "Delete",
                HeaderText = Loc.T("Delete", "حذف"),
                Text = Loc.T("🗑 Delete", "🗑 حذف"),
                UseColumnTextForButtonValue = true,
                Width = 80,
                AutoSizeMode = DataGridViewAutoSizeColumnMode.None
            };
            _grid.Columns.Add(colDel);

            foreach (DataGridViewColumn col in _grid.Columns)
            {
                if (col.Name != "Edit" && col.Name != "Delete") col.ReadOnly = true;
            }

            _grid.CellClick += delegate (object s, DataGridViewCellEventArgs ev)
            {
                if (ev.RowIndex < 0) return;
                string plate = Convert.ToString(_grid.Rows[ev.RowIndex].Cells["Plate"].Value);

                if (ev.ColumnIndex == _grid.Columns["Edit"].Index)
                {
                    var veh = ParkState.Instance.Vehicles.Find(v => v.PlateNumber == plate);
                    if (veh == null) return;
                    _editingPlate = plate;
                    _txtPlate.Text = veh.PlateNumber;
                    _txtBrand.Text = veh.Brand;
                    _txtModel.Text = veh.Model;
                    _txtColor.Text = veh.Color;
                    _txtOwner.Text = veh.OwnerName;
                    bool isParked = ParkState.Instance.Spaces.Exists(sp => sp.PlateNumber == plate && sp.Status == "OCCUPIED");
                    _txtPlate.ReadOnly = isParked;
                    _btnAdd.Text = Loc.T("💾 Save Changes", "💾 حفظ التعديل");
                    lbl.Text = Loc.T("Editing Vehicle: ", "تعديل بيانات المركبة: ") + plate;
                    _txtPlate.Focus();
                }
                else if (ev.ColumnIndex == _grid.Columns["Delete"].Index)
                {
                    var st = ParkState.Instance;
                    bool isParked = st.Spaces.Exists(sp => sp.PlateNumber == plate && sp.Status == "OCCUPIED");
                    if (isParked)
                    {
                        Loc.ShowMsg("Cannot delete vehicle (" + plate + ") while it is parked inside the garage!\nRetrieve it first.", "لا يمكن حذف المركبة (" + plate + ") لأنها موجودة حالياً داخل المواقف!\nيرجى استرجاعها أولاً.", "Cannot Delete", "لا يمكن الحذف", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        return;
                    }
                    var conf = Loc.ShowMsg("Permanently delete vehicle " + plate + "?", "هل تريد حذف المركبة " + plate + " من السجل نهائياً؟", "Confirm Delete", "تأكيد الحذف", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2);
                    if (conf == DialogResult.Yes)
                    {
                        st.Vehicles.RemoveAll(v => v.PlateNumber == plate);
                        st.RecordLocalAudit("VEHICLE_DELETE", plate, Loc.T("Deleted vehicle", "حذف المركبة من السجل"), Loc.UserDisplay(shell.CurrentUser));
                        st.NotifyChanged();
                        LoadRows();
                    }
                }
            };

            gridCard.Controls.Add(_grid);
            Controls.Add(gridCard);
            Controls.Add(topCard);

            LoadRows();
        }

        void ClearInputs()
        {
            _txtPlate.Text = "";
            _txtBrand.Text = "";
            _txtModel.Text = "";
            _txtColor.Text = "";
            _txtOwner.Text = "";
            _txtPlate.ReadOnly = false;
        }

        static TextBox MakeInput(Control parent, string placeholder, int x, int y, int w)
        {
            var tb = new TextBox { Font = Theme.F(10f) };
            tb.SetBounds(x, y, w, 32);
            var cap = Theme.Label(placeholder, Theme.F(8.5f), Theme.Muted);
            cap.SetBounds(x, y - 18, w, 16);
            parent.Controls.Add(cap);
            parent.Controls.Add(tb);
            return tb;
        }

        void LoadRows()
        {
            _grid.Rows.Clear();
            var st = ParkState.Instance;
            foreach (var v in st.Vehicles)
            {
                var sp = st.Spaces.Find(s => s.PlateNumber == v.PlateNumber && s.Status == "OCCUPIED");
                _grid.Rows.Add(v.PlateNumber, v.Brand, v.Model, v.Color, v.OwnerName, sp != null ? sp.SpaceNumber : Loc.T("Outside Garage", "خارج المواقف"), v.CreatedAt);
            }
        }

        public static DataGridView CreateStyledGrid()
        {
            var g = new DataGridView
            {
                Dock = DockStyle.Fill,
                BackgroundColor = Theme.Surface,
                BorderStyle = BorderStyle.None,
                AllowUserToAddRows = false,
                AllowUserToDeleteRows = false,
                ReadOnly = false,
                AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect,
                RowHeadersVisible = false,
                Font = Theme.F(10f),
                RightToLeft = Loc.Rtl
            };
            g.ColumnHeadersDefaultCellStyle.Font = Theme.Bold(10f);
            g.ColumnHeadersHeight = 38;
            g.RowTemplate.Height = 34;
            return g;
        }
    }

    class AlarmsPage : Panel
    {
        readonly MainForm _shell;
        readonly DataGridView _grid;

        public AlarmsPage(MainForm shell)
        {
            _shell = shell;
            BackColor = Theme.Back;
            DockStyle startDock = Loc.IsArabic ? DockStyle.Right : DockStyle.Left;

            var topBar = new Panel { Dock = DockStyle.Top, Height = 52 };
            var btnAck = new ModernButton
            {
                Text = Loc.T("Acknowledge Selected Alarm", "إقرار التنبيه المحدد (Acknowledge)"),
                IconGlyph = Icons.Check,
                Enabled = shell.CurrentUser.CanAcknowledgeAlarms
            };
            btnAck.Click += AcknowledgeSelected;

            var btnSafeReset = new ModernButton
            {
                Text = Loc.T("Safe PLC Reset (ParkDB.Reset)", "إعادة ضبط آمنة للـ PLC (Safe Reset)"),
                IconGlyph = Icons.Refresh,
                BaseColor = Theme.Blue,
                HoverColor = Color.FromArgb(29, 78, 216),
                Enabled = shell.CurrentUser.CanAcknowledgeAlarms
            };
            btnSafeReset.Click += delegate
            {
                var st = ParkState.Instance;
                st.RecordLocalAudit("SAFE_RESET", "PLC", Loc.T("Safe ParkDB.Reset pulse from Alarms screen", "نبضة ParkDB.Reset الآمنة من شاشة التنبيهات"), Loc.UserDisplay(_shell.CurrentUser));
                System.Threading.ThreadPool.QueueUserWorkItem(delegate { st.SendRecoveryAction("SAFE_RESET"); });
                Loc.ShowMsg(
                    "Safe Reset pulse (ParkDB.Reset) sent to PLC.\nAlarm Word is NOT force-zeroed for industrial safety.",
                    "تم إرسال نبضة إعادة ضبط آمنة (ParkDB.Reset) إلى الـ PLC.\nلن يتم تصفير سجل الأعطال (Alarm Word) قسرياً لضمان السلامة الصناعية.",
                    "Safe Reset", "إعادة ضبط آمنة",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
            };

            topBar.Controls.Add(Theme.Holder(btnAck, startDock, 260, new Padding(6, 4, 6, 8)));
            topBar.Controls.Add(Theme.Holder(btnSafeReset, startDock, 260, new Padding(0, 4, 6, 8)));

            var card = new Card { Dock = DockStyle.Fill, Padding = new Padding(12) };
            _grid = VehiclesPage.CreateStyledGrid();
            _grid.Columns.Add("Id", Loc.T("ID", "المعرف"));
            _grid.Columns.Add("Code", Loc.T("Alarm Code", "كود التنبيه"));
            _grid.Columns.Add("Severity", Loc.T("Severity", "الخطورة"));
            _grid.Columns.Add("Desc", Loc.T("Description", "الوصف"));
            _grid.Columns.Add("Source", Loc.T("Source", "المصدر"));
            _grid.Columns.Add("Status", Loc.T("Status", "الحالة"));
            _grid.Columns.Add("AckBy", Loc.T("Acknowledged By", "تم الإقرار بواسطة"));
            _grid.Columns.Add("Time", Loc.T("Timestamp", "الوقت"));
            card.Controls.Add(_grid);

            Controls.Add(card);
            Controls.Add(topBar);
            LoadAlarms();
        }

        void LoadAlarms()
        {
            _grid.Rows.Clear();
            foreach (var a in ParkState.Instance.Alarms)
            {
                _grid.Rows.Add(a.Id, a.Code, a.Severity, a.Description, a.Source, a.Status, a.AcknowledgedBy ?? "—", a.CreatedAt);
            }
        }

        void AcknowledgeSelected(object sender, EventArgs e)
        {
            if (_grid.SelectedRows.Count == 0) return;
            string id = Convert.ToString(_grid.SelectedRows[0].Cells[0].Value);
            var alarm = ParkState.Instance.Alarms.Find(a => a.Id == id);
            if (alarm != null)
            {
                alarm.Status = "ACKNOWLEDGED";
                alarm.AcknowledgedBy = Loc.UserDisplay(_shell.CurrentUser);
                ParkState.Instance.NotifyChanged();
                LoadAlarms();
            }
        }
    }

    class CommandsHistoryPage : Panel
    {
        readonly DataGridView _grid;

        public CommandsHistoryPage(MainForm shell)
        {
            BackColor = Theme.Back;
            DockStyle startDock = Loc.IsArabic ? DockStyle.Right : DockStyle.Left;

            var topBar = new Panel { Dock = DockStyle.Top, Height = 52 };
            var btnExport = new ModernButton
            {
                Text = Loc.T("Export Log to CSV / Excel", "تصدير السجل إلى ملف CSV / Excel"),
                IconGlyph = Icons.Download,
                BaseColor = Color.FromArgb(29, 111, 66),
                HoverColor = Color.FromArgb(22, 90, 53)
            };
            btnExport.Click += ExportCsv;
            topBar.Controls.Add(Theme.Holder(btnExport, startDock, 250, new Padding(0, 4, 0, 8)));

            var card = new Card { Dock = DockStyle.Fill, Padding = new Padding(12) };
            _grid = VehiclesPage.CreateStyledGrid();
            _grid.Columns.Add("CommandId", Loc.T("Command ID", "معرف الأمر الصناعي"));
            _grid.Columns.Add("ReqNo", Loc.T("Request No.", "رقم الطلب"));
            _grid.Columns.Add("Type", Loc.T("Action", "العملية"));
            _grid.Columns.Add("Plate", Loc.T("Plate / Details", "اللوحة / التفاصيل"));
            _grid.Columns.Add("Space", Loc.T("Bay / Target", "المصف / الهدف"));
            _grid.Columns.Add("Status", Loc.T("Status", "الحالة"));
            _grid.Columns.Add("User", Loc.T("Employee", "المستخدم"));
            _grid.Columns.Add("Created", Loc.T("Sent At", "وقت الإرسال"));
            _grid.Columns.Add("Completed", Loc.T("Completed At", "وقت الاكتمال"));

            foreach (var c in ParkState.Instance.Commands)
            {
                _grid.Rows.Add(c.CommandId, c.RequestNumber, c.Type, c.PlateNumber, c.SpaceNumber, c.Status, c.RequestedBy, c.CreatedAt, c.CompletedAt);
            }

            card.Controls.Add(_grid);
            Controls.Add(card);
            Controls.Add(topBar);
        }

        void ExportCsv(object sender, EventArgs e)
        {
            using (var sfd = new SaveFileDialog { Filter = "CSV Files (*.csv)|*.csv", FileName = "AutoPark_Commands_JO.csv" })
            {
                if (sfd.ShowDialog() != DialogResult.OK) return;
                var sb = new StringBuilder();
                sb.AppendLine("CommandID,RequestNumber,Type,PlateNumber,SpaceNumber,Status,RequestedBy,CreatedAt,CompletedAt");
                foreach (var c in ParkState.Instance.Commands)
                {
                    sb.AppendLine(string.Join(",", new string[]
                    {
                        EscapeCsvField(c.CommandId),
                        EscapeCsvField(c.RequestNumber),
                        EscapeCsvField(c.Type),
                        EscapeCsvField(c.PlateNumber),
                        EscapeCsvField(c.SpaceNumber),
                        EscapeCsvField(c.Status),
                        EscapeCsvField(c.RequestedBy),
                        EscapeCsvField(c.CreatedAt),
                        EscapeCsvField(c.CompletedAt)
                    }));
                }
                File.WriteAllText(sfd.FileName, sb.ToString(), new UTF8Encoding(true));
                Loc.ShowMsg("Log exported successfully to:\n" + sfd.FileName, "تم تصدير السجل بنجاح إلى:\n" + sfd.FileName, "Export", "تصدير", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }

        static string EscapeCsvField(string raw)
        {
            string s = raw ?? "";
            if (s.Length > 0 && (s[0] == '=' || s[0] == '+' || s[0] == '-' || s[0] == '@' || s[0] == '\t' || s[0] == '\r'))
                s = "'" + s;
            return "\"" + s.Replace("\"", "\"\"") + "\"";
        }
    }

    class PlcSettingsPage : Panel
    {
        readonly MainForm _shell;
        readonly ComboBox _cmbProtocol;
        readonly TextBox _txtModel, _txtIp, _txtPort, _txtRack, _txtSlot, _txtOpcUa, _txtAutoLogoff;
        readonly CheckBox _chkReadOnly;
        readonly DataGridView _tagsGrid;
        readonly Label _lblTestResult;

        public PlcSettingsPage(MainForm shell)
        {
            _shell = shell;
            BackColor = Theme.Back;
            AutoScroll = true;

            var s = shell.Settings;
            var card = new Card { Dock = DockStyle.Fill, Padding = new Padding(20) };

            var title = Theme.Label(
                Loc.T("Industrial PLC Integration & Tag Settings (saved to settings.ini)", "إعدادات الربط الصناعي والبروتوكول وعنوان الـ PLC (تُحفظ في settings.ini)"),
                Theme.Bold(13f), Theme.Ink);
            title.SetBounds(20, 14, 760, 30);

            int y = 54;
            var lProto = Theme.Label(Loc.T("Industrial Protocol:", "البروتوكول الصناعي (Protocol):"), Theme.Semi(10f), Theme.Ink);
            lProto.SetBounds(20, y, 210, 26);
            _cmbProtocol = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Font = Theme.F(10.5f) };
            _cmbProtocol.Items.AddRange(new object[] { "SIEMENS_S7", "OPC_UA", "MODBUS_TCP", "MQTT", "REST_GATEWAY", "CUSTOM_TCP", "MOCK" });
            _cmbProtocol.SelectedItem = s.Protocol;
            if (_cmbProtocol.SelectedIndex < 0) _cmbProtocol.SelectedIndex = 0;
            _cmbProtocol.SetBounds(240, y, 220, 32);

            var lIp = Theme.Label(Loc.T("PLC / Gateway IP Address:", "عنوان الـ IP للـ PLC / البوابة:"), Theme.Semi(10f), Theme.Ink);
            lIp.SetBounds(490, y, 190, 26);
            _txtIp = new TextBox { Text = s.PlcIp, Font = Theme.F(10.5f) };
            _txtIp.SetBounds(690, y, 180, 30);

            y += 44;
            var lPort = Theme.Label(Loc.T("TCP Port:", "رقم المنفذ (TCP Port):"), Theme.Semi(10f), Theme.Ink);
            lPort.SetBounds(20, y, 210, 26);
            _txtPort = new TextBox { Text = s.PlcPort.ToString(), Font = Theme.F(10.5f) };
            _txtPort.SetBounds(240, y, 100, 30);

            var lRack = Theme.Label(Loc.T("Rack (Siemens S7):", "Rack (لـ Siemens S7):"), Theme.Semi(10f), Theme.Ink);
            lRack.SetBounds(360, y, 140, 26);
            _txtRack = new TextBox { Text = s.Rack.ToString(), Font = Theme.F(10.5f) };
            _txtRack.SetBounds(505, y, 70, 30);

            var lSlot = Theme.Label(Loc.T("Slot (Siemens S7):", "Slot (لـ Siemens S7):"), Theme.Semi(10f), Theme.Ink);
            lSlot.SetBounds(600, y, 140, 26);
            _txtSlot = new TextBox { Text = s.Slot.ToString(), Font = Theme.F(10.5f) };
            _txtSlot.SetBounds(745, y, 70, 30);

            y += 44;
            var lModel = Theme.Label(Loc.T("PLC / Controller Model:", "موديل الـ PLC / المتحكم:"), Theme.Semi(10f), Theme.Ink);
            lModel.SetBounds(20, y, 210, 26);
            _txtModel = new TextBox { Text = s.PlcModel, Font = Theme.F(10f) };
            _txtModel.SetBounds(240, y, 630, 30);

            y += 44;
            var lOpc = Theme.Label(Loc.T("OPC UA Endpoint:", "عنوان OPC UA Endpoint:"), Theme.Semi(10f), Theme.Ink);
            lOpc.SetBounds(20, y, 210, 26);
            _txtOpcUa = new TextBox { Text = s.OpcUaEndpoint, Font = Theme.F(10f) };
            _txtOpcUa.SetBounds(240, y, 310, 30);

            var lLogoff = Theme.Label(Loc.T("Auto-Logoff (min):", "خروج تلقائي (دقيقة):"), Theme.Semi(9.5f), Theme.Ink);
            lLogoff.SetBounds(560, y, 130, 26);
            _txtAutoLogoff = new TextBox { Text = s.AutoLogoffMinutes.ToString(), Font = Theme.F(10f) };
            _txtAutoLogoff.SetBounds(695, y, 55, 30);

            _chkReadOnly = new CheckBox { Text = Loc.T("Read-Only Mode", "مراقبة فقط (Read-Only)"), Checked = s.ReadOnlyMode, AutoSize = true };
            _chkReadOnly.SetBounds(760, y + 4, 180, 26);

            y += 46;
            var lTags = Theme.Label(Loc.T("PLC Tag Mapping Table (Editable):", "جدول عناوين إشارات الـ PLC (قابل للتعديل في أي وقت):"), Theme.Bold(10.5f), Theme.Ink);
            lTags.SetBounds(20, y, 650, 26);

            y += 30;
            _tagsGrid = new DataGridView
            {
                BackgroundColor = Theme.Back,
                BorderStyle = BorderStyle.FixedSingle,
                AllowUserToAddRows = false,
                AllowUserToDeleteRows = false,
                AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
                RowHeadersVisible = false,
                Font = Theme.F(9.5f),
                RightToLeft = RightToLeft.No
            };
            _tagsGrid.SetBounds(20, y, 850, 220);
            _tagsGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Key", HeaderText = "Logical Tag Key", ReadOnly = true });
            _tagsGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Addr", HeaderText = "PLC Address (DB / Tag / Register)", ReadOnly = false });

            foreach (var kv in s.Tags)
                _tagsGrid.Rows.Add(kv.Key, kv.Value);

            y += 234;
            var btnSave = new ModernButton { Text = Loc.T("Save Settings (settings.ini)", "حفظ الإعدادات في settings.ini"), IconGlyph = Icons.Check };
            btnSave.SetBounds(20, y, 240, 42);
            btnSave.Click += SaveConfig;

            var btnTest = new ModernButton
            {
                Text = Loc.T("Test PLC Connection", "اختبار الاتصال بالمتحكم"),
                IconGlyph = Icons.Plug,
                BaseColor = Theme.Blue,
                HoverColor = Color.FromArgb(29, 78, 216)
            };
            btnTest.SetBounds(274, y, 260, 42);
            btnTest.Click += TestConn;

            _lblTestResult = Theme.Label("", Theme.Semi(10f), Theme.Ok);
            _lblTestResult.SetBounds(550, y + 8, 440, 30);

            card.Controls.AddRange(new Control[]
            {
                title, lProto, _cmbProtocol, lIp, _txtIp, lPort, _txtPort, lRack, _txtRack, lSlot, _txtSlot,
                lModel, _txtModel, lOpc, _txtOpcUa, lLogoff, _txtAutoLogoff, _chkReadOnly, lTags, _tagsGrid, btnSave, btnTest, _lblTestResult
            });
            Controls.Add(card);
        }

        void ApplyFormToSettings()
        {
            var s = _shell.Settings;
            s.Protocol = Convert.ToString(_cmbProtocol.SelectedItem ?? "SIEMENS_S7");
            string parsedHost;
            int parsedPort;
            int defPort = 102;
            int.TryParse(_txtPort.Text.Trim(), out defPort);
            RfBClient.ParseHostPort(_txtIp.Text.Trim(), defPort, out parsedHost, out parsedPort);
            s.PlcIp = parsedHost;
            s.PlcPort = parsedPort;
            _txtIp.Text = parsedHost;
            _txtPort.Text = parsedPort.ToString();
            int n;
            if (int.TryParse(_txtRack.Text.Trim(), out n)) s.Rack = n;
            if (int.TryParse(_txtSlot.Text.Trim(), out n)) s.Slot = n;
            s.PlcModel = _txtModel.Text.Trim();
            s.OpcUaEndpoint = _txtOpcUa.Text.Trim();
            if (int.TryParse(_txtAutoLogoff.Text.Trim(), out n) && n >= 0) s.AutoLogoffMinutes = n;
            s.ReadOnlyMode = _chkReadOnly.Checked;

            foreach (DataGridViewRow row in _tagsGrid.Rows)
            {
                string k = Convert.ToString(row.Cells[0].Value);
                string v = Convert.ToString(row.Cells[1].Value);
                if (!string.IsNullOrEmpty(k)) s.Tags[k] = v ?? "";
            }
        }

        void SaveConfig(object sender, EventArgs e)
        {
            ApplyFormToSettings();
            _shell.Settings.Save();
            _shell.UpdateFooterStatus();
            _lblTestResult.ForeColor = Theme.Ok;
            _lblTestResult.Text = Loc.T("✅ Settings saved successfully to settings.ini", "✅ تم حفظ الإعدادات بنجاح في settings.ini");
        }

        void TestConn(object sender, EventArgs e)
        {
            ApplyFormToSettings();
            try
            {
                string msg = _shell.Settings.TestPlcConnection();
                _lblTestResult.ForeColor = Theme.Ok;
                _lblTestResult.Text = "✅ " + msg;
            }
            catch (Exception ex)
            {
                _lblTestResult.ForeColor = Theme.Err;
                _lblTestResult.Text = "❌ " + ex.Message;
            }
        }
    }
}
