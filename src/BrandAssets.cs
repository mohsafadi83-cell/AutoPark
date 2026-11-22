using System;
using System.Drawing;
using System.IO;
using System.Reflection;

namespace AutoPark
{
    static class BrandAssets
    {
        public const string CompanyNameEn = "TECHNO Electrical.Jo";
        public const string CompanyNameAr = "TECHNO Electrical.Jo — تكنو";

        static Image _logo;
        static Icon _icon;
        static bool _loaded;

        public static Image Logo
        {
            get
            {
                EnsureLoaded();
                return _logo;
            }
        }

        public static Icon AppIcon
        {
            get
            {
                EnsureLoaded();
                return _icon;
            }
        }

        static void EnsureLoaded()
        {
            if (_loaded) return;
            _loaded = true;
            try
            {
                var asm = Assembly.GetExecutingAssembly();
                using (var s = asm.GetManifestResourceStream("techno_logo.png"))
                {
                    if (s != null)
                    {
                        using (var ms = new MemoryStream())
                        {
                            s.CopyTo(ms);
                            ms.Position = 0;
                            _logo = Image.FromStream(ms);
                        }
                    }
                }
            }
            catch { }

            if (_logo == null)
            {
                try
                {
                    string p = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "assets", "techno_logo.png");
                    if (File.Exists(p)) _logo = Image.FromFile(p);
                }
                catch { }
            }

            try
            {
                _icon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location);
            }
            catch { }
        }
    }
}
