using System;
using System.IO;
using System.Net;
using System.Windows.Forms;

namespace AutoPark
{
    static class Program
    {
        [STAThread]
        static int Main(string[] args)
        {
            try
            {
                ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072 | SecurityProtocolType.Tls;
            }
            catch { }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += delegate (object s, System.Threading.ThreadExceptionEventArgs e)
            {
                Loc.ShowMsg(
                    "An unexpected error occurred:\n" + e.Exception.Message,
                    "حدث خطأ غير متوقع:\n" + e.Exception.Message,
                    "Error", "خطأ",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            };

            string dir = Path.GetDirectoryName(Application.ExecutablePath);
            string iniPath = Path.Combine(dir, "settings.ini");

            if (!File.Exists(iniPath))
            {
                AppSettings.CreateTemplate(iniPath);
            }

            AppSettings settings;
            try
            {
                settings = AppSettings.Load(iniPath);
                Loc.Lang = settings.Language;
                if (!string.IsNullOrEmpty(settings.ApiBaseUrl))
                    ParkState.Instance.ApiBaseUrl = settings.ApiBaseUrl;
            }
            catch (Exception ex)
            {
                Loc.ShowMsg(
                    "Configuration error (settings.ini):\n" + ex.Message,
                    "في مشكلة بملف الإعدادات (settings.ini):\n" + ex.Message,
                    "Settings Error", "ملف الإعدادات",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }

            if (Array.IndexOf(args, "--selftest") >= 0)
            {
                int passed, failed;
                string circuitReport = ClassicControlState.RunCircuitSelfTest(out passed, out failed);
                string summary = string.Format(
                    "Status={0} Spaces={1} Protocol={2} Lang={3} CircuitsPassed={4} CircuitsFailed={5}\r\n{6}",
                    failed == 0 ? "OK" : "FAIL",
                    ParkState.Instance.Spaces.Count,
                    settings.Protocol,
                    Loc.Lang,
                    passed,
                    failed,
                    circuitReport);
                string outFile = Path.Combine(Path.GetTempPath(), "AutoPark_selftest.txt");
                File.WriteAllText(outFile, summary, System.Text.Encoding.UTF8);
                return failed == 0 ? 0 : 2;
            }

            while (true)
            {
                UserAccount user = null;
                while (true)
                {
                    using (var login = new LoginForm(settings))
                    {
                        var res = login.ShowDialog();
                        if (res == DialogResult.Retry) continue; // language switched on login screen
                        if (res != DialogResult.OK) return 0;
                        user = login.AuthenticatedUser;
                        break;
                    }
                }

                while (true)
                {
                    var main = new MainForm(settings, user);
                    Application.Run(main);
                    if (main.LanguageSwitched) continue; // reload MainForm cleanly in new language
                    if (main.LoggedOut) break;           // back to LoginForm
                    return 0;
                }
            }
        }
    }
}
