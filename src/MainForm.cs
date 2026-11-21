using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace AutoPark
{
    class ActivityMessageFilter : IMessageFilter
    {
        public DateTime LastActivity = DateTime.Now;
        public bool PreFilterMessage(ref Message m)
        {
            // Mouse clicks, wheel, or key presses reset idle timer
            if (m.Msg == 0x0100 || m.Msg == 0x0201 || m.Msg == 0x0204 || m.Msg == 0x020A)
            {
                LastActivity = DateTime.Now;
            }
            return false;
        }
    }

    class MainForm : Form
    {
        class NavEntry
        {
            public Control Page;
            public string Title;
        }

        readonly AppSettings _settings;
        readonly UserAccount _user;
        readonly Panel _body;
        readonly Label _title;
        readonly Panel _backHolder;
        readonly Label _plcDot;
        readonly Label _plcText;
        readonly Stack<NavEntry> _history = new Stack<NavEntry>();
        readonly ActivityMessageFilter _idleFilter = new ActivityMessageFilter();
        NavEntry _current;

        public bool LoggedOut { get; private set; }
        public bool LanguageSwitched { get; private set; }
        public AppSettings Settings { get { return _settings; } }
        public UserAccount CurrentUser { get { return _user; } }

        public MainForm(AppSettings settings, UserAccount user)
        {
            _settings = settings;
            _user = user;
            Theme.PrepareForm(this);
            Text = Loc.T("Auto Park — Automated Smart Parking System (Jordan)", "أوتو بارك — منظومة المواقف الذكية المؤتمتة (الأردن)");
            ClientSize = new Size(1280, 800);
            MinimumSize = new Size(1060, 680);
            WindowState = FormWindowState.Maximized;
            KeyPreview = true;

            DockStyle startDock = Loc.IsArabic ? DockStyle.Right : DockStyle.Left;
            DockStyle endDock = Loc.IsArabic ? DockStyle.Left : DockStyle.Right;

            // ---------- header ----------
            var header = new Panel();
            header.Dock = DockStyle.Top;
            header.Height = 70;
            header.BackColor = Theme.Surface;
            header.Padding = new Padding(20, 0, 20, 0);
            header.Paint += delegate (object s, PaintEventArgs e)
            {
                using (var p = new Pen(Theme.Border)) e.Graphics.DrawLine(p, 0, header.Height - 1, header.Width, header.Height - 1);
            };

            _title = Theme.Label("", Theme.Bold(14.5f), Theme.Ink);
            _title.Dock = DockStyle.Fill;
            _title.Padding = new Padding(12, 0, 12, 0);

            var back = new ModernButton();
            back.Text = Loc.T("Back", "رجوع");
            back.IconGlyph = Icons.Back;
            back.IconSize = 10f;
            back.Font = Theme.Semi(10.5f);
            back.BaseColor = Theme.Surface;
            back.HoverColor = Theme.SurfaceHover;
            back.PressColor = Theme.PrimarySoft;
            back.BorderColor = Theme.Border;
            back.ForeColor = Theme.Ink;
            back.Click += delegate { GoBack(); };
            _backHolder = Theme.Holder(back, startDock, 108, new Padding(6, 16, 6, 16));

            var homeBtn = new ModernButton();
            homeBtn.Text = Loc.T("Home", "الرئيسية");
            homeBtn.IconGlyph = Icons.Map;
            homeBtn.IconSize = 10f;
            homeBtn.Font = Theme.Semi(10f);
            homeBtn.BaseColor = Theme.PrimarySoft;
            homeBtn.HoverColor = Theme.SurfaceHover;
            homeBtn.PressColor = Theme.PrimarySoft;
            homeBtn.ForeColor = Theme.Primary;
            homeBtn.Click += delegate { GoHome(); };

            var langBtn = new ModernButton();
            langBtn.Text = Loc.ToggleButtonLabel;
            langBtn.Font = Theme.Bold(9.5f);
            langBtn.BaseColor = Theme.BlueSoft;
            langBtn.HoverColor = Theme.PrimarySoft;
            langBtn.PressColor = Theme.PrimarySoft;
            langBtn.ForeColor = Theme.Blue;
            langBtn.Click += delegate
            {
                Loc.Lang = Loc.IsArabic ? "en" : "ar";
                _settings.Language = Loc.Lang;
                _settings.Save();
                LanguageSwitched = true;
                Close();
            };

            var logo = new Panel();
            logo.Dock = startDock;
            logo.Width = 54;
            logo.BackColor = Color.Transparent;
            logo.Paint += PaintLogo;

            var logout = new ModernButton();
            logout.Text = Loc.T("Sign Out", "خروج");
            logout.IconGlyph = Icons.Power;
            logout.IconSize = 10f;
            logout.Font = Theme.Semi(10.5f);
            logout.BaseColor = Theme.Surface;
            logout.HoverColor = Theme.ErrSoft;
            logout.PressColor = Theme.ErrSoft;
            logout.BorderColor = Theme.Border;
            logout.ForeColor = Theme.Err;
            logout.Click += delegate { LoggedOut = true; Close(); };

            var chip = new ModernButton();
            chip.Text = Loc.UserDisplay(user);
            chip.IconGlyph = Icons.User;
            chip.IconSize = 11f;
            chip.Font = Theme.Semi(9.5f);
            chip.BaseColor = Theme.Back;
            chip.HoverColor = Theme.Back;
            chip.PressColor = Theme.Back;
            chip.ForeColor = Theme.Ink;
            chip.Radius = 18;
            chip.Cursor = Cursors.Default;
            chip.TabStop = false;

            header.Controls.Add(_title);
            header.Controls.Add(_backHolder);
            header.Controls.Add(logo);
            header.Controls.Add(Theme.Holder(homeBtn, endDock, 108, new Padding(6, 16, 6, 16)));
            header.Controls.Add(Theme.Holder(langBtn, endDock, 92, new Padding(6, 16, 6, 16)));
            header.Controls.Add(Theme.Holder(chip, endDock, 255, new Padding(6, 16, 6, 16)));
            header.Controls.Add(Theme.Holder(logout, endDock, 104, new Padding(0, 16, 0, 16)));

            // ---------- footer ----------
            var footer = new Panel();
            footer.Dock = DockStyle.Bottom;
            footer.Height = 32;
            footer.BackColor = Theme.Surface;
            footer.Padding = new Padding(16, 0, 16, 0);
            footer.Paint += delegate (object s, PaintEventArgs e)
            {
                using (var p = new Pen(Theme.Border)) e.Graphics.DrawLine(p, 0, 0, footer.Width, 0);
            };
            _plcText = Theme.Label("", Theme.F(9.5f), Theme.Muted);
            _plcText.Dock = DockStyle.Fill;
            _plcDot = Theme.Label("●", Theme.F(11f), Theme.Ok);
            _plcDot.Dock = startDock;
            _plcDot.Width = 22;
            var ver = Theme.Label("AutoPark v2.0 — Jordan (12 Bays)", Theme.F(9f), Theme.Muted);
            ver.Dock = endDock;
            ver.Width = 230;
            ver.TextAlign = Theme.AlignEnd;
            footer.Controls.Add(_plcText);
            footer.Controls.Add(_plcDot);
            footer.Controls.Add(ver);

            // ---------- body ----------
            _body = new Panel();
            _body.Dock = DockStyle.Fill;
            _body.BackColor = Theme.Back;
            _body.Padding = new Padding(24, 18, 24, 18);

            Controls.Add(_body);
            Controls.Add(header);
            Controls.Add(footer);

            ParkState.Instance.Changed += UpdateFooterStatus;
            UpdateFooterStatus();

            Application.AddMessageFilter(_idleFilter);

            var dbSyncTimer = new Timer { Interval = 4000 };
            dbSyncTimer.Tick += delegate
            {
                if (ParkState.Instance.BackendConnected)
                {
                    System.Threading.ThreadPool.QueueUserWorkItem(delegate
                    {
                        ParkState.Instance.PullSpacesFromDatabase();
                        ParkState.Instance.PullSensorsFromBackend();
                        if (!IsDisposed && IsHandleCreated)
                        {
                            try { BeginInvoke((Action)UpdateFooterStatus); } catch { }
                        }
                    });
                }
            };
            dbSyncTimer.Start();

            // Automatic Idle Logoff Timer
            var idleTimer = new Timer { Interval = 5000 };
            idleTimer.Tick += delegate
            {
                int limitMin = _settings.AutoLogoffMinutes;
                if (limitMin <= 0) return;
                if ((DateTime.Now - _idleFilter.LastActivity).TotalMinutes >= limitMin)
                {
                    idleTimer.Stop();
                    dbSyncTimer.Stop();
                    var st = ParkState.Instance;
                    st.RecordLocalAudit("AUTO_LOGOFF", "SESSION",
                        Loc.T("Auto-logoff after " + limitMin + " min inactivity", "تسجيل خروج تلقائي بعد " + limitMin + " دقائق من عدم النشاط"),
                        Loc.UserDisplay(_user));
                    string logoffTag;
                    if (_settings.Tags.TryGetValue("user_logoff_tag", out logoffTag) && !string.IsNullOrEmpty(logoffTag))
                    {
                        string tCopy = logoffTag;
                        System.Threading.ThreadPool.QueueUserWorkItem(delegate { st.SendPlcWrite(tCopy, 1, 350); });
                    }
                    LoggedOut = true;
                    Loc.ShowMsg(
                        "You have been automatically signed out after " + limitMin + " minutes of inactivity.",
                        "تم تسجيل الخروج تلقائياً لحماية النظام بعد مرور " + limitMin + " دقائق بدون نشاط.",
                        "Auto-Logoff", "تسجيل خروج تلقائي",
                        MessageBoxButtons.OK, MessageBoxIcon.Information);
                    Close();
                }
            };
            idleTimer.Start();

            FormClosing += delegate
            {
                dbSyncTimer.Stop();
                idleTimer.Stop();
                Application.RemoveMessageFilter(_idleFilter);
                ParkState.Instance.Changed -= UpdateFooterStatus;
            };

            ShowPage(new NavEntry
            {
                Page = new HomePage(this),
                Title = Loc.T("Control Dashboard & Parking Map (12 Bays — 4 Lanes × 3 Floors)", "لوحة التحكم وخريطة المصفات (12 مصف — 4 مسارات × 3 طوابق)")
            });

            KeyDown += delegate (object s, KeyEventArgs e)
            {
                if ((e.KeyCode == Keys.Left && e.Alt) || (e.KeyCode == Keys.Escape && _history.Count > 0))
                {
                    GoBack();
                    e.Handled = true;
                }
            };
        }

        public void UpdateFooterStatus()
        {
            if (IsDisposed) return;
            var st = ParkState.Instance;
            if (st.ControllerOffline)
            {
                _plcDot.ForeColor = Theme.Err;
                _plcText.Text = Loc.T(
                    "Industrial Controller Offline — All motion commands locked for safety",
                    "المتحكم الصناعي غير متصل (Controller Offline) — تم إيقاف أوامر الحركة للأمان");
            }
            else if (st.EmergencyStop || st.Sensors.EmergencyPhysical)
            {
                _plcDot.ForeColor = Theme.Err;
                _plcText.Text = Loc.T(
                    "🔴 Emergency Stop Active — Click 'Emergency Recovery' to safely clear",
                    "🔴 إيقاف الطوارئ مفعّل (Emergency Stop Active) — اضغط «استعادة الطوارئ» لمعالجة الحالة بأمان");
            }
            else if (st.Sensors.MaintenanceDue)
            {
                _plcDot.ForeColor = Theme.Amber;
                _plcText.Text = Loc.T(
                    "⚠ Periodic Maintenance Due | PLC: " + _settings.PlcIp + ":" + _settings.PlcPort + " | Auto-Logoff: " + _settings.AutoLogoffMinutes + "m",
                    "⚠ تنبيه صيانة دورية (Period_Maintanence) | متصل بـ " + _settings.PlcIp + ":" + _settings.PlcPort + " | خروج تلقائي: " + _settings.AutoLogoffMinutes + "د");
            }
            else
            {
                _plcDot.ForeColor = Theme.Ok;
                string dbTag = st.BackendConnected
                    ? Loc.T("🟢 Synced with PostgreSQL + Mobile", "🟢 متزامن مع PostgreSQL + الموبايل")
                    : Loc.T("🟡 Local Database", "🟡 قاعدة بيانات محلية");
                string pcell = st.Sensors.PhotocellClear
                    ? Loc.T("Entrance Clear", "المدخل فارغ")
                    : Loc.T("⚠ Entrance Blocked", "⚠ عائق بالمدخل");
                _plcText.Text = Loc.T("Connected (", "متصل بالماكنة (") + _settings.Protocol + " — " + _settings.PlcIp + ":" + _settings.PlcPort + ") | " + pcell + " | " + dbTag + " | 12 " + Loc.T("Bays (P3↑..P1↓)", "مصف (P3↑..P1↓)");
            }
        }

        public void Navigate(Control page, string title)
        {
            if (_current != null) _history.Push(_current);
            ShowPage(new NavEntry { Page = page, Title = title });
        }

        public void GoHome()
        {
            while (_history.Count > 0)
            {
                var old = _history.Pop();
                old.Page.Dispose();
            }
            if (_current != null)
            {
                _current.Page.Dispose();
                _current = null;
            }
            ShowPage(new NavEntry
            {
                Page = new HomePage(this),
                Title = Loc.T("Control Dashboard & Parking Map (12 Bays — 4 Lanes × 3 Floors)", "لوحة التحكم وخريطة المصفات (12 مصف — 4 مسارات × 3 طوابق)")
            });
        }

        public void GoBack()
        {
            if (_history.Count == 0) return;
            var prev = _history.Pop();
            if (_current != null)
            {
                _body.Controls.Remove(_current.Page);
                _current.Page.Dispose();
            }
            _current = prev;
            _title.Text = prev.Title;
            _backHolder.Visible = _history.Count > 0;
            prev.Page.Visible = true;
        }

        void ShowPage(NavEntry next)
        {
            if (_current != null) _current.Page.Visible = false;
            _current = next;
            next.Page.Dock = DockStyle.Fill;
            if (!_body.Controls.Contains(next.Page)) _body.Controls.Add(next.Page);
            next.Page.BringToFront();
            _title.Text = next.Title;
            _backHolder.Visible = _history.Count > 0;
        }

        static void PaintLogo(object sender, PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            var r = new Rectangle(6, 14, 42, 42);
            using (var path = Theme.Round(r, 10))
            using (var b = new SolidBrush(Theme.Primary))
                g.FillPath(b, path);
            using (var f = Theme.Icon(18f))
                TextRenderer.DrawText(g, Icons.Car, f, r, Color.White,
                    TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
        }
    }
}
