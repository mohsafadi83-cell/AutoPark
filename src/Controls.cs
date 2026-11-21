using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace AutoPark
{
    class ModernButton : Control, IButtonControl
    {
        bool _hover, _pressed;

        public Color BaseColor { get; set; }
        public Color HoverColor { get; set; }
        public Color PressColor { get; set; }
        public Color BorderColor { get; set; }
        public int Radius { get; set; }
        public string IconGlyph { get; set; }
        public float IconSize { get; set; }
        public bool Tile { get; set; }
        public string SubText { get; set; }
        public Color SubColor { get; set; }
        public Color TileIconBack { get; set; }
        public Color TileIconColor { get; set; }
        public DialogResult DialogResult { get; set; }

        public ModernButton()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
                     ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw |
                     ControlStyles.SupportsTransparentBackColor | ControlStyles.Selectable, true);
            BackColor = Color.Transparent;
            BaseColor = Theme.Primary;
            HoverColor = Theme.PrimaryHover;
            PressColor = Theme.PrimaryPress;
            BorderColor = Color.Empty;
            ForeColor = Color.White;
            Radius = 8;
            IconSize = 12f;
            SubColor = Theme.Muted;
            TileIconBack = Theme.PrimarySoft;
            TileIconColor = Theme.Primary;
            Font = Theme.Semi(11f);
            Cursor = Cursors.Hand;
            TabStop = true;
        }

        public void NotifyDefault(bool value) { }

        public void PerformClick()
        {
            if (Enabled) OnClick(EventArgs.Empty);
        }

        protected override void OnClick(EventArgs e)
        {
            base.OnClick(e);
            if (DialogResult != DialogResult.None)
            {
                var f = FindForm();
                if (f != null) f.DialogResult = DialogResult;
            }
        }

        protected override void OnMouseEnter(EventArgs e) { _hover = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { _hover = false; _pressed = false; Invalidate(); base.OnMouseLeave(e); }
        protected override void OnMouseDown(MouseEventArgs e)
        {
            if (e.Button == MouseButtons.Left) { _pressed = true; Invalidate(); }
            base.OnMouseDown(e);
        }
        protected override void OnMouseUp(MouseEventArgs e) { _pressed = false; Invalidate(); base.OnMouseUp(e); }
        protected override void OnKeyUp(KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Enter || e.KeyCode == Keys.Space) PerformClick();
            base.OnKeyUp(e);
        }
        protected override void OnEnabledChanged(EventArgs e) { Invalidate(); base.OnEnabledChanged(e); }
        protected override void OnTextChanged(EventArgs e) { Invalidate(); base.OnTextChanged(e); }
        protected override void OnGotFocus(EventArgs e) { Invalidate(); base.OnGotFocus(e); }
        protected override void OnLostFocus(EventArgs e) { Invalidate(); base.OnLostFocus(e); }

        static Color Mix(Color a, Color b, double t)
        {
            return Color.FromArgb(
                (int)(a.R + (b.R - a.R) * t), (int)(a.G + (b.G - a.G) * t), (int)(a.B + (b.B - a.B) * t));
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;

            Color fill = _pressed ? PressColor : (_hover ? HoverColor : BaseColor);
            Color fg = ForeColor;
            if (!Enabled)
            {
                if (fill.A == 255) fill = Mix(fill, Theme.Back, 0.45);
                fg = Mix(fg, fill.A == 255 ? fill : Theme.Back, 0.4);
            }

            var r = new Rectangle(0, 0, Width - 1, Height - 1);
            using (var path = Theme.Round(r, Radius))
            {
                if (fill.A > 0) using (var b = new SolidBrush(fill)) g.FillPath(b, path);
                if (BorderColor != Color.Empty)
                    using (var p = new Pen(Focused ? Theme.Primary : BorderColor)) g.DrawPath(p, path);
            }

            if (Tile) PaintTile(g, fg); else PaintInline(g, fg);
        }

        void PaintInline(Graphics g, Color fg)
        {
            const TextFormatFlags flags = TextFormatFlags.NoPadding | TextFormatFlags.SingleLine |
                                          TextFormatFlags.VerticalCenter | TextFormatFlags.RightToLeft;
            bool hasText = !string.IsNullOrEmpty(Text);
            bool hasIcon = !string.IsNullOrEmpty(IconGlyph);

            Size ts = hasText ? TextRenderer.MeasureText(g, Text, Font, Size.Empty, flags) : Size.Empty;
            using (var iconFont = Theme.Icon(IconSize))
            {
                Size isz = hasIcon ? TextRenderer.MeasureText(g, IconGlyph, iconFont, Size.Empty, TextFormatFlags.NoPadding) : Size.Empty;
                int gap = hasText && hasIcon ? 8 : 0;
                int x = (Width - (ts.Width + gap + isz.Width)) / 2;

                if (hasText)
                    TextRenderer.DrawText(g, Text, Font, new Rectangle(x, 0, ts.Width + 2, Height), fg, flags);
                if (hasIcon)
                    TextRenderer.DrawText(g, IconGlyph, iconFont,
                        new Rectangle(x + ts.Width + gap, 1, isz.Width + 2, Height),
                        fg, TextFormatFlags.NoPadding | TextFormatFlags.SingleLine | TextFormatFlags.VerticalCenter);
            }
        }

        void PaintTile(Graphics g, Color fg)
        {
            const int pad = 20, circle = 50;
            var circleRect = new Rectangle(Width - pad - circle, pad, circle, circle);
            using (var b = new SolidBrush(TileIconBack)) g.FillEllipse(b, circleRect);
            if (!string.IsNullOrEmpty(IconGlyph))
                using (var iconFont = Theme.Icon(20f))
                    TextRenderer.DrawText(g, IconGlyph, iconFont, circleRect, TileIconColor,
                        TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);

            int y = pad + circle + 12;
            var right = TextFormatFlags.Right | TextFormatFlags.RightToLeft | TextFormatFlags.NoPadding;
            using (var tf = Theme.Bold(14f))
                TextRenderer.DrawText(g, Text, tf, new Rectangle(pad, y, Width - pad * 2, 30), fg,
                    right | TextFormatFlags.SingleLine | TextFormatFlags.EndEllipsis);
            if (!string.IsNullOrEmpty(SubText))
                using (var sf = Theme.F(9.5f))
                    TextRenderer.DrawText(g, SubText, sf, new Rectangle(pad, y + 32, Width - pad * 2, Height - y - 36), SubColor,
                        right | TextFormatFlags.WordBreak);
        }
    }

    class Card : Panel
    {
        public int Radius { get; set; }
        public Color FillColor { get; set; }
        public Color BorderColor { get; set; }
        public Color AccentColor { get; set; }

        public Card()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
                     ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw |
                     ControlStyles.SupportsTransparentBackColor, true);
            BackColor = Color.Transparent;
            Radius = 12;
            FillColor = Theme.Surface;
            BorderColor = Theme.Border;
            AccentColor = Color.Empty;
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            var r = new Rectangle(0, 0, Width - 1, Height - 1);
            using (var path = Theme.Round(r, Radius))
            {
                using (var b = new SolidBrush(FillColor)) g.FillPath(b, path);
                if (AccentColor != Color.Empty)
                {
                    g.SetClip(path);
                    using (var b = new SolidBrush(AccentColor)) g.FillRectangle(b, Width - 5, 0, 5, Height);
                    g.ResetClip();
                }
                using (var p = new Pen(BorderColor)) g.DrawPath(p, path);
            }
            base.OnPaint(e);
        }
    }

    class FieldBox : Card
    {
        readonly Control _inner;
        readonly Panel _clip;
        readonly Label _icon;
        readonly int _bleed;

        public Control Inner { get { return _inner; } }

        public FieldBox(Control inner, string icon, int bleed)
        {
            _inner = inner;
            _bleed = bleed;
            Radius = 8;
            Height = 42;
            Margin = new Padding(6, 2, 6, 2);

            _clip = new Panel();
            _clip.BackColor = Theme.Surface;
            inner.Font = Theme.F(11f);
            _clip.Controls.Add(inner);
            Controls.Add(_clip);

            if (!string.IsNullOrEmpty(icon))
            {
                _icon = new Label();
                _icon.Text = icon;
                _icon.Font = Theme.Icon(12f);
                _icon.ForeColor = Theme.Muted;
                _icon.BackColor = Color.Transparent;
                _icon.TextAlign = ContentAlignment.MiddleCenter;
                _icon.Click += delegate { _inner.Focus(); };
                Controls.Add(_icon);
            }

            inner.Enter += delegate { BorderColor = Theme.Primary; Invalidate(); };
            inner.Leave += delegate { BorderColor = Theme.Border; Invalidate(); };
            Click += delegate { _inner.Focus(); };
        }

        protected override void OnLayout(LayoutEventArgs e)
        {
            base.OnLayout(e);
            if (_clip == null) return;
            int iconW = _icon != null ? 34 : 0;
            if (_icon != null) _icon.SetBounds(Width - iconW - 4, 1, iconW, Height - 2);
            int h = _inner.Height - _bleed * 2;
            int w = Width - 12 - iconW - 8;
            _clip.SetBounds(10, Math.Max(2, (Height - h) / 2), Math.Max(10, w), h);
            _inner.SetBounds(-_bleed, -_bleed, _clip.Width + _bleed * 2, _inner.Height);
        }
    }

    class KpiCard : Card
    {
        readonly Label _value;

        public KpiCard(string title, Color accent)
        {
            AccentColor = accent;
            Padding = new Padding(14, 10, 22, 10);
            Margin = new Padding(6, 0, 6, 0);
            Dock = DockStyle.Fill;

            _value = Theme.Label("—", Theme.Bold(17f), Theme.Ink);
            _value.Dock = DockStyle.Fill;
            _value.RightToLeft = RightToLeft.No;
            _value.TextAlign = ContentAlignment.MiddleRight;
            var t = Theme.Label(title, Theme.F(10f), Theme.Muted);
            t.Dock = DockStyle.Top;
            t.Height = 24;

            Controls.Add(_value);
            Controls.Add(t);
        }

        public string Value
        {
            get { return _value.Text; }
            set { _value.Text = value; FitText(); }
        }

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            if (_value != null) FitText();
        }

        void FitText()
        {
            int room = _value.Width - 6;
            if (room <= 0) return;
            float size = 17f;
            while (size > 9f)
            {
                using (var f = Theme.Bold(size))
                    if (TextRenderer.MeasureText(_value.Text, f).Width <= room) break;
                size -= 0.5f;
            }
            if (Math.Abs(_value.Font.Size - size) > 0.01f) _value.Font = Theme.Bold(size);
        }
    }
}
