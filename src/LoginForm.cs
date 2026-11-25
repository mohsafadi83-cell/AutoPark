using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
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
        readonly CheckBox _chkRemember;
        readonly Label _error;
        int _failedAttempts = 0;
        DateTime _lockoutUntilUtc = DateTime.MinValue;

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
            ClientSize = new Size(820, 420);
            BackColor = Theme.Border;
            Padding = new Padding(1);
            KeyPreview = true;

            // ---- brand side (left) ----
            var brand = new Panel();
            brand.Dock = DockStyle.Left;
            brand.Width = 340;
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

            const int x = 44, w = 390;

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
            title.SetBounds(x, 54, w, 40);
            var sub = Theme.Label(Loc.T("Authorized Personnel Only", "الدخول للمصرح لهم فقط"), Theme.F(9.5f), Theme.Muted);
            sub.SetBounds(x, 94, w, 24);

            var lu = Theme.Label(Loc.T("Username", "اسم المستخدم"), Theme.Semi(10f), Theme.Ink);
            lu.SetBounds(x, 134, w, 24);
            _user = new TextBox();
            _user.BorderStyle = BorderStyle.None;
            var userBox = new FieldBox(_user, Icons.User, 0);
            userBox.SetBounds(x, 160, w, 42);

            var lp = Theme.Label(Loc.T("Password", "كلمة المرور"), Theme.Semi(10f), Theme.Ink);
            lp.SetBounds(x, 214, w, 24);
            _pass = new TextBox();
            _pass.BorderStyle = BorderStyle.None;
            _pass.UseSystemPasswordChar = true;
            var passBox = new FieldBox(_pass, Icons.Lock, 0);
            passBox.SetBounds(x, 240, w, 42);

            _error = Theme.Label("", Theme.F(9.3f), Theme.Err);
            _error.SetBounds(x, 286, w, 24);

            _chkRemember = new CheckBox();
            _chkRemember.Text = Loc.T("Remember username & password on this PC (Encrypted)", "تذكر اسم المستخدم وكلمة المرور على هذا الجهاز (مشفّر)");
            _chkRemember.Font = Theme.F(9f);
            _chkRemember.ForeColor = Theme.Ink;
            _chkRemember.AutoSize = true;
            _chkRemember.Checked = true;
            _chkRemember.SetBounds(x, 312, w, 24);

            var login = new ModernButton();
            login.Text = Loc.T("Sign In", "تسجيل الدخول");
            login.Font = Theme.Bold(12f);
            login.SetBounds(x, 344, w, 46);
            login.Click += OnLogin;
            AcceptButton = login;

            side.Controls.AddRange(new Control[] { btnLang, title, sub, lu, userBox, lp, passBox, _error, _chkRemember, login });

            Controls.Add(side);
            Controls.Add(brand);

            LoadSavedCredentials();

            Shown += delegate { if (_user.Text.Length > 0 && _pass.Text.Length > 0) login.Focus(); else _user.Focus(); };
            KeyDown += delegate (object s, KeyEventArgs e)
            {
                if (e.KeyCode == Keys.Escape) { DialogResult = DialogResult.Cancel; Close(); }
            };
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

            var logoBox = new Rectangle((r.Width - 128) / 2, 62, 128, 146);
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
            using (var f = Theme.Bold(18f))
                TextRenderer.DrawText(g, BrandAssets.CompanyNameEn, f, new Rectangle(0, 228, r.Width, 38), Color.White, center);
            using (var f = Theme.Semi(13f))
                TextRenderer.DrawText(g, Loc.T("Auto Park", "أوتو بارك"), f, new Rectangle(0, 268, r.Width, 30), Color.FromArgb(225, 248, 250), center);
            using (var f = Theme.F(9.8f))
                TextRenderer.DrawText(g, Loc.T("Secure Access Portal", "بوابة الدخول الآمن"), f, new Rectangle(0, 302, r.Width, 26),
                    Color.FromArgb(200, 236, 239), center);
        }

        void OnLogin(object sender, EventArgs e)
        {
            if (DateTime.UtcNow < _lockoutUntilUtc)
            {
                int rem = Math.Max(1, (int)Math.Ceiling((_lockoutUntilUtc - DateTime.UtcNow).TotalSeconds));
                _error.Text = Loc.T("Too many failed attempts. Try again in " + rem + "s.", "محاولات دخول فاشلة متكررة. حاول مجدداً بعد " + rem + " ثانية.");
                return;
            }

            string user = _user.Text.Trim();
            string pwd = _pass.Text;
            UserAccount acc;

            if (user.Length > 0 && pwd.Length > 0 && _settings.Users.TryGetValue(user, out acc) && PasswordSecurity.VerifyPassword(pwd, acc.Password))
            {
                _failedAttempts = 0;
                if (_chkRemember.Checked) SaveEncryptedCredentials(user, pwd);
                else ClearSavedCredentials();
                ParkState.Instance.EnsureBackendRunningAndLogin(user, pwd);
                _pass.Text = "";
                AuthenticatedUser = acc;
                DialogResult = DialogResult.OK;
                Close();
                return;
            }

            _failedAttempts++;
            if (_failedAttempts >= 5)
            {
                _lockoutUntilUtc = DateTime.UtcNow.AddSeconds(60);
                _failedAttempts = 0;
                _error.Text = Loc.T("Account locked for 60s due to failed attempts.", "تم قفل الدخول لمدة 60 ثانية بسبب محاولات فاشلة متكررة.");
            }
            else
            {
                _error.Text = Loc.T("Invalid username or password", "اسم المستخدم أو كلمة المرور غير صحيحة");
            }
            _pass.Text = "";
            _pass.Focus();
        }

        static string CredFilePath
        {
            get
            {
                string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AutoPark");
                Directory.CreateDirectory(dir);
                return Path.Combine(dir, "cred.dat");
            }
        }

        static byte[] DeriveMachineUserKey()
        {
            string seed = "AutoPark-Cred-V1|" + Environment.MachineName + "|" + Environment.UserName;
            using (var sha = SHA256.Create())
                return sha.ComputeHash(Encoding.UTF8.GetBytes(seed));
        }

        void SaveEncryptedCredentials(string user, string pwd)
        {
            try
            {
                byte[] plain = Encoding.UTF8.GetBytes(user + "\n" + pwd);
                using (var aes = new AesManaged())
                {
                    aes.Key = DeriveMachineUserKey();
                    aes.GenerateIV();
                    using (var ms = new MemoryStream())
                    {
                        ms.Write(aes.IV, 0, aes.IV.Length);
                        using (var cs = new CryptoStream(ms, aes.CreateEncryptor(), CryptoStreamMode.Write))
                        {
                            cs.Write(plain, 0, plain.Length);
                            cs.FlushFinalBlock();
                        }
                        File.WriteAllBytes(CredFilePath, ms.ToArray());
                    }
                }
            }
            catch { }
        }

        void LoadSavedCredentials()
        {
            try
            {
                string path = CredFilePath;
                if (!File.Exists(path)) return;
                byte[] blob = File.ReadAllBytes(path);
                if (blob.Length < 17) return;
                byte[] iv = new byte[16];
                Buffer.BlockCopy(blob, 0, iv, 0, 16);
                using (var aes = new AesManaged())
                {
                    aes.Key = DeriveMachineUserKey();
                    aes.IV = iv;
                    using (var ms = new MemoryStream(blob, 16, blob.Length - 16))
                    using (var cs = new CryptoStream(ms, aes.CreateDecryptor(), CryptoStreamMode.Read))
                    using (var sr = new StreamReader(cs, Encoding.UTF8))
                    {
                        string content = sr.ReadToEnd();
                        int nl = content.IndexOf('\n');
                        if (nl > 0)
                        {
                            _user.Text = content.Substring(0, nl);
                            _pass.Text = content.Substring(nl + 1);
                            _chkRemember.Checked = true;
                        }
                    }
                }
            }
            catch { }
        }

        static void ClearSavedCredentials()
        {
            try
            {
                string path = CredFilePath;
                if (File.Exists(path)) File.Delete(path);
            }
            catch { }
        }
    }
}
