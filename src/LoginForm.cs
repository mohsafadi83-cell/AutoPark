using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace AutoPark
{
    class LoginForm : Form
    {
        [DllImport("user32.dll")] static extern bool ReleaseCapture();
        [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, int msg, int w, int l);

        readonly AppSettings _settings;
        readonly TextBox _user;
        readonly TextBox _pass;
        readonly Label _error;

        public UserAccount AuthenticatedUser { get; private set; }

        protected override CreateParams CreateParams
        {
            get
            {
                var cp = base.CreateParams;
                cp.ClassStyle |= 0x20000; // CS_DROPSHADOW
                return cp;
            }
        }

        public LoginForm(AppSettings settings)
        {
            _settings = settings;
            Theme.PrepareForm(this);
            if (BrandAssets.AppIcon != null) Icon = BrandAssets.AppIcon;
            Text = Loc.T("Sign In — TECHNO Electrical.Jo | Auto Park", "تسجيل الدخول — TECHNO Electrical.Jo | أوتو بارك");
            FormBorderStyle = FormBorderStyle.None;
            ClientSize = new Size(860, 520);
            BackColor = Theme.Border;
            Padding = new Padding(1);
            KeyPreview = true;

            // ---- brand side (left) ----
            var brand = new Panel();
            brand.Dock = DockStyle.Left;
            brand.Width = 370;
            brand.Paint += PaintBrand;
            brand.MouseDown += Drag;

            var close = new ModernButton();
            close.IconGlyph = Icons.Close;
            close.IconSize = 10f;
            close.BaseColor = Color.Transparent;
            close.HoverColor = Color.FromArgb(50, 255, 255, 255);
            close.PressColor = Color.FromArgb(80, 255, 255, 255);
            close.SetBounds(12, 12, 36, 36);
            close.TabStop = false;
            close.Click += delegate { DialogResult = DialogResult.Cancel; Close(); };
            brand.Controls.Add(close);

            // ---- form side (right) ----
            var side = new Panel();
            side.Dock = DockStyle.Fill;
            side.BackColor = Theme.Surface;
            side.MouseDown += Drag;

            const int x = 48, w = 390;

            var btnLang = new ModernButton();
            btnLang.Text = Loc.ToggleButtonLabel;
            btnLang.Font = Theme.Semi(9.2f);
            btnLang.BaseColor = Theme.PrimarySoft;
            btnLang.HoverColor = Theme.SurfaceHover;
            btnLang.PressColor = Theme.PrimarySoft;
            btnLang.ForeColor = Theme.Primary;
            btnLang.Radius = 8;
            btnLang.SetBounds(368, 14, 96, 30);
            btnLang.Click += delegate
            {
                Loc.Lang = Loc.IsArabic ? "en" : "ar";
                _settings.Language = Loc.Lang;
                _settings.Save();
                DialogResult = DialogResult.Retry;
                Close();
            };

            var title = Theme.Label(Loc.T("Control Center Sign In", "تسجيل الدخول إلى مركز التحكم"), Theme.Bold(18f), Theme.Ink);
            title.SetBounds(x, 42, w, 40);
            var sub = Theme.Label(Loc.T("Automated Smart Parking System (12 Bays — 4 Lanes × 3 Floors)", "منظومة المواقف الذكية المؤتمتة (12 مصف — 4 مسارات × 3 طوابق)"), Theme.F(9.5f), Theme.Muted);
            sub.SetBounds(x, 82, w, 24);

            var lu = Theme.Label(Loc.T("Username", "اسم المستخدم"), Theme.Semi(10f), Theme.Ink);
            lu.SetBounds(x, 122, w, 24);
            _user = new TextBox();
            _user.BorderStyle = BorderStyle.None;
            _user.Text = "superadmin";
            var userBox = new FieldBox(_user, Icons.User, 0);
            userBox.SetBounds(x, 148, w, 42);

            var lp = Theme.Label(Loc.T("Password", "كلمة المرور"), Theme.Semi(10f), Theme.Ink);
            lp.SetBounds(x, 200, w, 24);
            _pass = new TextBox();
            _pass.BorderStyle = BorderStyle.None;
            _pass.UseSystemPasswordChar = true;
            _pass.Text = "Admin@12345";
            var passBox = new FieldBox(_pass, Icons.Lock, 0);
            passBox.SetBounds(x, 226, w, 42);

            _error = Theme.Label("", Theme.F(9.5f), Theme.Err);
            _error.SetBounds(x, 274, w, 24);

            var login = new ModernButton();
            login.Text = Loc.T("Sign In", "تسجيل الدخول");
            login.Font = Theme.Bold(12f);
            login.SetBounds(x, 302, w, 46);
            login.Click += OnLogin;
            AcceptButton = login;

            var quickLbl = Theme.Label(Loc.T("Registered Staff Accounts (Quick Fill):", "حسابات الموظفين المعرّفين (تعبئة سريعة):"), Theme.F(9f), Theme.Muted);
            quickLbl.SetBounds(x, 362, w, 20);

            var quickFlow = new FlowLayoutPanel();
            quickFlow.SetBounds(x, 386, w, 82);
            quickFlow.BackColor = Color.Transparent;
            quickFlow.RightToLeft = Loc.Rtl;

            AddQuickButton(quickFlow, Loc.T("Super Admin", "مدير أعلى (superadmin)"), "superadmin", "Admin@12345");
            AddQuickButton(quickFlow, Loc.T("System Admin", "مدير النظام (admin)"), "admin", "Admin@12345");
            AddQuickButton(quickFlow, Loc.T("Operator", "مشغّل (operator)"), "operator", "Operator@123");
            AddQuickButton(quickFlow, Loc.T("Maintenance Eng.", "مهندس صيانة (engineer)"), "engineer", "Engineer@123");
            AddQuickButton(quickFlow, Loc.T("Attendant", "موظف مواقف (attendant)"), "attendant", "Operator@123");
            AddQuickButton(quickFlow, Loc.T("Read Only", "قراءة فقط (viewer)"), "viewer", "Viewer@1234");

            var foot = Theme.Label(
                Loc.T("PLC: ", "المتحكم: ") + settings.Protocol + " (" + settings.PlcIp + ":" + settings.PlcPort + ") | " +
                Loc.T("Capacity: ", "السعة: ") + settings.TotalSpaces + Loc.T(" Bays", " مصف"),
                Theme.F(8.8f), Theme.Muted);
            foot.SetBounds(x, 480, w, 22);

            side.Controls.AddRange(new Control[] { btnLang, title, sub, lu, userBox, lp, passBox, _error, login, quickLbl, quickFlow, foot });

            Controls.Add(side);
            Controls.Add(brand);

            Shown += delegate { _user.Focus(); };
            KeyDown += delegate (object s, KeyEventArgs e)
            {
                if (e.KeyCode == Keys.Escape) { DialogResult = DialogResult.Cancel; Close(); }
            };
        }

        void AddQuickButton(FlowLayoutPanel parent, string label, string u, string p)
        {
            var btn = new ModernButton();
            btn.Text = label;
            btn.Font = Theme.F(8.3f);
            btn.Size = new Size(122, 32);
            btn.Radius = 6;
            btn.BaseColor = Theme.Back;
            btn.HoverColor = Theme.PrimarySoft;
            btn.PressColor = Theme.PrimarySoft;
            btn.BorderColor = Theme.Border;
            btn.ForeColor = Theme.Ink;
            btn.Margin = new Padding(0, 0, 6, 6);
            btn.Click += delegate
            {
                _user.Text = u;
                _pass.Text = p;
                _error.Text = "";
            };
            parent.Controls.Add(btn);
        }

        void Drag(object sender, MouseEventArgs e)
        {
            if (e.Button != MouseButtons.Left) return;
            ReleaseCapture();
            SendMessage(Handle, 0xA1, 2, 0);
        }

        void PaintBrand(object sender, PaintEventArgs e)
        {
            var p = (Panel)sender;
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            var r = p.ClientRectangle;
            using (var b = new LinearGradientBrush(r, Color.FromArgb(16, 138, 148), Color.FromArgb(9, 72, 84), 60f))
                g.FillRectangle(b, r);

            using (var b = new SolidBrush(Color.FromArgb(18, 255, 255, 255)))
            {
                g.FillEllipse(b, -90, r.Height - 170, 260, 260);
                g.FillEllipse(b, r.Width - 120, -60, 200, 200);
            }

            var logoBox = new Rectangle((r.Width - 132) / 2, 72, 132, 152);
            using (var path = Theme.Round(logoBox, 16))
            using (var b = new SolidBrush(Color.White))
                g.FillPath(b, path);
            if (BrandAssets.Logo != null)
            {
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                int pad = 12;
                float scale = Math.Min((float)(logoBox.Width - 2 * pad) / BrandAssets.Logo.Width, (float)(logoBox.Height - 2 * pad) / BrandAssets.Logo.Height);
                int dw = (int)(BrandAssets.Logo.Width * scale);
                int dh = (int)(BrandAssets.Logo.Height * scale);
                g.DrawImage(BrandAssets.Logo, logoBox.X + (logoBox.Width - dw) / 2, logoBox.Y + (logoBox.Height - dh) / 2, dw, dh);
            }

            var center = TextFormatFlags.HorizontalCenter | TextFormatFlags.NoPadding | (Loc.IsArabic ? TextFormatFlags.RightToLeft : TextFormatFlags.Default);
            using (var f = Theme.Bold(19f))
                TextRenderer.DrawText(g, BrandAssets.CompanyNameEn, f, new Rectangle(0, 240, r.Width, 38), Color.White, center);
            using (var f = Theme.Semi(13.5f))
                TextRenderer.DrawText(g, Loc.T("Auto Park — Smart Parking", "أوتو بارك — المواقف الذكية"), f, new Rectangle(0, 280, r.Width, 30), Color.FromArgb(225, 248, 250), center);
            using (var f = Theme.F(10f))
                TextRenderer.DrawText(g, Loc.T("Automated Parking Management & Control", "نظام الإدارة والتحكم بالمواقف الآلية"), f, new Rectangle(0, 314, r.Width, 26),
                    Color.FromArgb(200, 236, 239), center);
            using (var f = Theme.F(9.5f))
                TextRenderer.DrawText(g, "Siemens SIMATIC S7-1200 PLC Ready", f, new Rectangle(0, 344, r.Width, 24),
                    Color.FromArgb(175, 220, 225), center);
        }

        void OnLogin(object sender, EventArgs e)
        {
            string user = _user.Text.Trim();
            UserAccount acc;

            if (user.Length > 0 && _settings.Users.TryGetValue(user, out acc) && acc.Password == _pass.Text)
            {
                ParkState.Instance.EnsureBackendRunningAndLogin(user, _pass.Text);
                AuthenticatedUser = acc;
                DialogResult = DialogResult.OK;
                Close();
                return;
            }

            _error.Text = Loc.T("Invalid username or password", "اسم المستخدم أو كلمة المرور غير صحيحة");
            _pass.SelectAll();
            _pass.Focus();
        }
    }
}
