using System;
using System.Windows.Forms;

namespace AutoPark
{
    /// <summary>
    /// Bilingual Localization Engine (English primary/default + Arabic full translation).
    /// </summary>
    static class Loc
    {
        public static string Lang = "en"; // Default primary language: English

        public static bool IsArabic
        {
            get { return string.Equals(Lang, "ar", StringComparison.OrdinalIgnoreCase); }
        }

        public static RightToLeft Rtl
        {
            get { return IsArabic ? RightToLeft.Yes : RightToLeft.No; }
        }

        public static MessageBoxOptions MsgOptions
        {
            get { return IsArabic ? (MessageBoxOptions.RtlReading | MessageBoxOptions.RightAlign) : (MessageBoxOptions)0; }
        }

        public static string T(string en, string ar)
        {
            return IsArabic ? ar : en;
        }

        public static string ToggleButtonLabel
        {
            get { return IsArabic ? "English" : "العربية"; }
        }

        public static string RoleDisplay(string role)
        {
            switch ((role ?? "").ToUpperInvariant())
            {
                case "SUPER_ADMIN": return T("Super Admin", "مدير النظام الأعلى");
                case "SYSTEM_ADMIN": return T("System Admin", "مدير النظام");
                case "OPERATOR": return T("Operator", "مشغّل النظام");
                case "PARKING_ATTENDANT": return T("Parking Attendant", "موظف مواقف");
                case "MAINTENANCE_ENGINEER": return T("Maintenance Engineer", "مهندس صيانة");
                case "CUSTOMER": return T("Customer", "عميل");
                case "READ_ONLY": return T("Read Only", "قراءة فقط");
                default: return role ?? "";
            }
        }

        public static string UserDisplay(UserAccount u)
        {
            if (u == null) return "";
            if (IsArabic)
            {
                if (!string.IsNullOrEmpty(u.FullName)) return u.FullName;
                return u.Username + " (" + RoleDisplay(u.Role) + ")";
            }
            // English display for built-in staff accounts
            switch ((u.Username ?? "").ToLowerInvariant())
            {
                case "superadmin": return "Mohammad Al-Safadi";
                case "admin": return "Khaled Al-Tarawneh (System Admin)";
                case "operator": return "Fahad Al-Abbadi (Operator)";
                case "attendant": return "Saad Al-Zoubi (Attendant)";
                case "engineer": return "Eng. Tareq Al-Momani (Maintenance)";
                case "viewer": return "Yasser Al-Hyari (Read Only)";
                default: return u.Username + " (" + RoleDisplay(u.Role) + ")";
            }
        }

        public static DialogResult ShowMsg(string enText, string arText, string enTitle, string arTitle, MessageBoxButtons btns, MessageBoxIcon icon, MessageBoxDefaultButton defBtn)
        {
            return MessageBox.Show(T(enText, arText), T(enTitle, arTitle), btns, icon, defBtn, MsgOptions);
        }

        public static DialogResult ShowMsg(string enText, string arText, string enTitle, string arTitle, MessageBoxButtons btns, MessageBoxIcon icon)
        {
            return MessageBox.Show(T(enText, arText), T(enTitle, arTitle), btns, icon, MessageBoxDefaultButton.Button1, MsgOptions);
        }
    }
}
