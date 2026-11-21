using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace AutoPark
{
    static class Theme
    {
        public static readonly Color Primary = Color.FromArgb(14, 124, 134);
        public static readonly Color PrimaryHover = Color.FromArgb(11, 104, 113);
        public static readonly Color PrimaryPress = Color.FromArgb(8, 84, 92);
        public static readonly Color PrimarySoft = Color.FromArgb(224, 242, 243);
        public static readonly Color Back = Color.FromArgb(243, 245, 248);
        public static readonly Color Surface = Color.White;
        public static readonly Color SurfaceHover = Color.FromArgb(240, 249, 250);
        public static readonly Color Border = Color.FromArgb(222, 228, 235);
        public static readonly Color Ink = Color.FromArgb(31, 41, 55);
        public static readonly Color Muted = Color.FromArgb(107, 114, 128);
        public static readonly Color Ok = Color.FromArgb(22, 163, 74);
        public static readonly Color OkSoft = Color.FromArgb(220, 252, 231);
        public static readonly Color Err = Color.FromArgb(220, 38, 38);
        public static readonly Color ErrSoft = Color.FromArgb(254, 226, 226);
        public static readonly Color Amber = Color.FromArgb(217, 119, 6);
        public static readonly Color AmberSoft = Color.FromArgb(254, 243, 199);
        public static readonly Color Blue = Color.FromArgb(37, 99, 235);
        public static readonly Color BlueSoft = Color.FromArgb(219, 234, 254);
        public static readonly Color Purple = Color.FromArgb(124, 58, 237);

        public const ContentAlignment AlignStart = ContentAlignment.MiddleLeft;
        public const ContentAlignment AlignEnd = ContentAlignment.MiddleRight;

        const string FontName = "Segoe UI";
        static string _iconFont;

        public static Font F(float size) { return new Font(FontName, size); }
        public static Font Bold(float size) { return new Font(FontName, size, FontStyle.Bold); }
        public static Font Semi(float size) { return new Font("Segoe UI Semibold", size); }

        public static Font Icon(float size)
        {
            if (_iconFont == null)
            {
                _iconFont = "Segoe MDL2 Assets";
                using (var f = new Font(_iconFont, 10f))
                    if (f.Name != _iconFont) _iconFont = "Segoe Fluent Icons";
            }
            return new Font(_iconFont, size);
        }

        public static void PrepareForm(Form f)
        {
            f.RightToLeft = Loc.Rtl;
            f.RightToLeftLayout = false;
            f.Font = F(10.5f);
            f.BackColor = Back;
            f.StartPosition = FormStartPosition.CenterScreen;
        }

        public static GraphicsPath Round(Rectangle r, int radius)
        {
            var p = new GraphicsPath();
            if (radius <= 0 || r.Width <= 0 || r.Height <= 0) { p.AddRectangle(r); return p; }
            int d = radius * 2;
            if (d > r.Width) d = r.Width;
            if (d > r.Height) d = r.Height;
            p.AddArc(r.X, r.Y, d, d, 180, 90);
            p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }

        public static Label Label(string text, Font font, Color color)
        {
            var l = new Label();
            l.Text = text;
            l.Font = font;
            l.ForeColor = color;
            l.BackColor = Color.Transparent;
            l.TextAlign = AlignStart;
            l.AutoSize = false;
            return l;
        }

        public static Panel Holder(Control c, DockStyle dock, int width, Padding padding)
        {
            var p = new Panel();
            p.Dock = dock;
            p.Width = width;
            p.Padding = padding;
            p.BackColor = Color.Transparent;
            c.Dock = DockStyle.Fill;
            p.Controls.Add(c);
            return p;
        }
    }

    static class Icons
    {
        public const string Car = "\uE804";
        public const string Park = "\uE81D";
        public const string Map = "\uE707";
        public const string Shield = "\uEA18";
        public const string Warning = "\uE7BA";
        public const string Settings = "\uE713";
        public const string History = "\uE81C";
        public const string Search = "\uE721";
        public const string Download = "\uE896";
        public const string User = "\uE77B";
        public const string Lock = "\uE72E";
        public const string Power = "\uE7E8";
        public const string Back = "\uE72A";
        public const string Close = "\uE711";
        public const string Refresh = "\uE72C";
        public const string Check = "\uE73E";
        public const string Plug = "\uE839";
    }
}
