using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml.Serialization;

namespace AutoPark
{
    public class UserAccount
    {
        public string Username;
        public string Password;
        public string FullName;
        public string Role;
        public string Phone;
        public string Email;

        public bool CanControl
        {
            get { return Role != "READ_ONLY"; }
        }

        public bool IsAdmin
        {
            get { return Role == "SUPER_ADMIN" || Role == "SYSTEM_ADMIN"; }
        }

        public bool CanAcknowledgeAlarms
        {
            get { return Role == "SUPER_ADMIN" || Role == "SYSTEM_ADMIN" || Role == "OPERATOR" || Role == "MAINTENANCE_ENGINEER"; }
        }

        public bool CanMaintenance
        {
            get { return Role == "SUPER_ADMIN" || Role == "SYSTEM_ADMIN" || Role == "MAINTENANCE_ENGINEER"; }
        }
    }

    public class AppSettings
    {
        public string IniPath;
        public string Language = "en"; // Default primary language: English ("en" | "ar")
        public string ApiBaseUrl = "http://192.168.0.30:3000/api/v1";
        public static readonly string FallbackTunnelApiUrl = "https://plymouth-attached-cinema-muze.trycloudflare.com/api/v1";
        public string PublicServerIp = "46.185.128.165";
        public string Protocol = "SIEMENS_S7";
        public string PlcModel = "Siemens SIMATIC S7-1200 CPU 1212C (192.168.0.27:102)";
        public string PlcIp = "192.168.0.27";
        public int PlcPort = 102;
        public string HmiVncIp = "192.168.0.30:5900";
        public string VncPassword = "";
        public int Rack = 0;
        public int Slot = 1;
        public string OpcUaEndpoint = "opc.tcp://192.168.0.27:4840";
        public string OpcUaSecurityMode = "SignAndEncrypt";
        public int AutoLogoffMinutes = 5;
        public int TotalSpaces = 12;
        public int SpacesPerColumn = 4;
        public bool ReadOnlyMode = false;

        public Dictionary<string, string> Tags = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        public Dictionary<string, UserAccount> Users = new Dictionary<string, UserAccount>(StringComparer.OrdinalIgnoreCase);

        public static readonly string[] DefaultTagKeys = new string[]
        {
            "system_ready_tag",
            "emergency_status_tag",
            "emergency_during_move_tag",
            "safety_ok_tag",
            "obstacle_exist_tag",
            "obstacle_reset_tag",
            "stopper_fault_tag",
            "lift_invalid_pos_tag",
            "heartbeat_tag",
            "machine_state_tag",
            "parking_space_status_tag",
            "vehicle_position_tag",
            "alarm_tag",
            "alarm_section_tag",
            "reset_command_tag",
            "maintenance_due_tag",
            "maintenance_reset_tag",
            "auto_mode_tag",
            "lane_number_tag",
            "level_number_tag",
            "park_command_tag",
            "retrieve_command_tag",
            "command_id_tag",
            "target_space_tag",
            "command_acknowledgement_tag",
            "command_complete_tag",
            "command_error_tag",
            "step1_ready_tag",
            "step1_ok_tag",
            "step1_start_tag",
            "step2_ready_tag",
            "step2_ok_tag",
            "step2_start_tag",
            "cancel_step_tag",
            "complete_seq_tag",
            "spot_L11_tag", "spot_L12_tag", "spot_L13_tag",
            "spot_L21_tag", "spot_L22_tag", "spot_L23_tag",
            "spot_L31_tag", "spot_L32_tag", "spot_L33_tag",
            "spot_L41_tag", "spot_L42_tag", "spot_L43_tag",
            "ls_L1_top", "ls_L1_mid", "ls_L1_btm",
            "ls_L2_top", "ls_L2_mid", "ls_L2_btm",
            "ls_L3_top", "ls_L3_mid", "ls_L3_btm",
            "ls_L4_top", "ls_L4_mid", "ls_L4_btm",
            "mg_prot_L1", "mg_prot_L2", "mg_prot_L3", "mg_prot_L4",
            "check_loc_L1", "check_loc_L2", "check_loc_L3", "check_loc_L4",
            "manual_mode_tag", "manual_ok_tag", "sim_manual_tag", "manual_action_tag", "reset_m_tag",
            "man_pump_tag", "man_wall_tag", "man_cutoff_tag", "man_up_tag", "man_down_tag",
            "man_s1_tag", "man_s2_tag", "man_s3_tag", "man_s4_tag",
            "man_l1_tag", "man_l2_tag", "man_l3_tag", "man_l4_tag",
            "allow_wall_tag", "user_logoff_tag"
        };

        public static string GetDefaultTagAddress(string key)
        {
            switch (key)
            {
                case "system_ready_tag": return "DB1,X0.4";
                case "emergency_status_tag": return "M50.0";
                case "emergency_during_move_tag": return "M7.0";
                case "safety_ok_tag": return "DB1,X0.7";
                case "pcell_in_1_tag": return "I0.1";
                case "main_pf_in_tag": return "I0.0";
                case "out_photocell_tag": return "I0.2";
                case "pump_ol_in_tag": return "I0.3";
                case "comp_ol_in_tag": return "I0.4";
                case "emergency_in_tag": return "I0.7";
                case "pcell_inside_db_tag": return "DB1,X0.7";
                case "pcell_outside_db_tag": return "DB1,X1.0";
                case "fault_db_tag": return "DB1,X0.0";
                case "emg_db_tag": return "DB1,X0.1";
                case "pfail_db_tag": return "DB1,X0.2";
                case "auto_ok_tag": return "DB1,X0.4";
                case "wall_sim_up_tag": return "DB1,X3.0";
                case "obstacle_exist_tag": return "M3.3";
                case "obstacle_reset_tag": return "M5.7";
                case "pump_overload_tag": return "M50.1";
                case "compressor_overload_tag": return "M50.2";
                case "error_in_position_tag": return "M50.3";
                case "stopper_fault_tag": return "M50.4";
                case "lift_invalid_pos_tag": return "M50.5";
                case "siren_silencer_tag": return "M9.7";
                case "heartbeat_tag": return "M60.3";
                case "machine_state_tag": return "DB1,X0.3";
                case "parking_space_status_tag": return "IB0";
                case "vehicle_position_tag": return "DB2,B4";
                case "alarm_tag": return "DB2,W8";
                case "alarm_section_tag": return "MW50";
                case "reset_command_tag": return "DB2,X10.0";
                case "reset_m_tag": return "M0.5";
                case "maintenance_due_tag": return "DB2,X10.1";
                case "maintenance_reset_tag": return "DB2,X10.2";
                case "wall_valve_db_tag": return "DB2,X10.3";
                case "step1_done_tag": return "DB2,X5.5";
                case "step2_done_tag": return "DB2,X5.7";
                case "auto_no_progress_tag": return "DB2,X6.2";
                case "auto_mode_tag": return "DB1,X0.3";
                case "sim_manual_tag": return "DB1,X2.7";
                case "manual_action_tag": return "M0.3";
                case "lane_number_tag": return "DB2,B3";
                case "level_number_tag": return "DB2,B4";
                case "park_command_tag": return "DB2,X6.3";
                case "retrieve_command_tag": return "DB2,X6.4";
                case "command_id_tag": return "DB2,B3";
                case "target_space_tag": return "DB2,B4";
                case "command_acknowledgement_tag": return "DB2,X6.0";
                case "command_complete_tag": return "DB2,X6.1";
                case "command_error_tag": return "MW50";
                case "step1_ready_tag": return "DB2,X5.4";
                case "step1_ok_tag": return "DB2,X6.0";
                case "step1_start_tag": return "M10.0";
                case "step2_ready_tag": return "DB2,X5.6";
                case "step2_ok_tag": return "DB2,X6.1";
                case "step2_start_tag": return "M10.1";
                case "cancel_step_tag": return "M3.1";
                case "complete_seq_tag": return "M7.1";
                case "manual_mode_tag": return "DB1,X0.5";
                case "manual_ok_tag": return "DB1,X0.6";
                case "man_pump_tag": return "DB1,X1.1";
                case "man_wall_tag": return "DB1,X1.2";
                case "man_cutoff_tag": return "DB1,X1.5";
                case "man_up_tag": return "DB1,X1.3";
                case "man_down_tag": return "DB1,X1.4";
                case "man_s1_tag": return "DB1,X2.2";
                case "man_s2_tag": return "DB1,X2.3";
                case "man_s3_tag": return "DB1,X2.4";
                case "man_s4_tag": return "DB1,X2.5";
                case "man_l1_tag": return "DB1,X1.6";
                case "man_l2_tag": return "DB1,X1.7";
                case "man_l3_tag": return "DB1,X2.0";
                case "man_l4_tag": return "DB1,X2.1";
                case "allow_wall_tag": return "M200.0";
                case "user_logoff_tag": return "DB1,X2.6";
                case "check_loc_L1": return "M3.4";
                case "check_loc_L2": return "M3.5";
                case "check_loc_L3": return "M3.6";
                case "check_loc_L4": return "M3.7";
            }
            if (key.StartsWith("spot_L") && key.EndsWith("_tag") && key.Length == 12)
                return "ParkDB." + key.Substring(5, 3);
            if (key.StartsWith("ls_L") && key.Length >= 9)
            {
                // Verified TIA Portal %I table: BTM=I2.4..I2.7, TOP=I3.0..I3.3, MID=I3.4..I3.7 (Lane 1..4)
                int ln;
                if (int.TryParse(key.Substring(4, 1), out ln) && ln >= 1 && ln <= 4)
                {
                    string pos = key.Substring(6).ToLowerInvariant();
                    if (pos == "btm") return "I2." + (3 + ln);
                    if (pos == "top") return "I3." + (ln - 1);
                    if (pos == "mid") return "I3." + (3 + ln);
                }
            }
            if (key.StartsWith("mg_prot_L") && key.Length == 10)
                return "I2." + (int.Parse(key.Substring(9, 1)) - 1);
            if (key.StartsWith("check_loc_L") && key.Length == 12)
                return "Lane" + key.Substring(11, 1) + "_check_location";
            return "ParkDB." + key.ToUpperInvariant();
        }

        /// <summary>Direct mapping verified from TIA Portal V17 HMI Spot Selection (pp. 42-61 & 159-168): P1->Level 1, P2->Level 2, P3->Level 3.</summary>
        public static int MapUiFloorToPlcLevel(int uiFloor)
        {
            if (uiFloor <= 1) return 1;
            if (uiFloor >= 3) return 3;
            return 2;
        }

        public static int MapPlcLevelToUiFloor(int plcLevel)
        {
            if (plcLevel <= 1) return 1;
            if (plcLevel >= 3) return 3;
            return 2;
        }

        public static AppSettings Load(string path)
        {
            var s = new AppSettings { IniPath = path };
            foreach (var k in DefaultTagKeys) s.Tags[k] = GetDefaultTagAddress(k);

            string section = "";
            string[] lines = File.ReadAllLines(path, Encoding.UTF8);

            for (int i = 0; i < lines.Length; i++)
            {
                string line = lines[i].Trim();
                if (line.Length == 0 || line.StartsWith(";") || line.StartsWith("#")) continue;

                if (line.StartsWith("[") && line.EndsWith("]"))
                {
                    section = line.Substring(1, line.Length - 2).Trim().ToUpperInvariant();
                    continue;
                }

                int eq = line.IndexOf('=');
                if (eq <= 0) continue;
                string key = line.Substring(0, eq).Trim();
                string val = line.Substring(eq + 1).Trim();

                if (section == "GENERAL")
                {
                    if (key.Equals("Language", StringComparison.OrdinalIgnoreCase))
                        s.Language = val.Equals("ar", StringComparison.OrdinalIgnoreCase) ? "ar" : "en";
                    else if (key.Equals("ApiBaseUrl", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrEmpty(val))
                        s.ApiBaseUrl = val;
                    else if (key.Equals("PublicServerIp", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrEmpty(val))
                        s.PublicServerIp = val;
                }
                else if (section == "PLC")
                {
                    int n;
                    switch (key.ToUpperInvariant())
                    {
                        case "PROTOCOL":
                            string pVal = val.ToUpperInvariant();
                            s.Protocol = (pVal == "VNC") ? "SIEMENS_S7" : pVal;
                            break;
                        case "PLCMODEL": s.PlcModel = val; break;
                        case "IP":
                            string parsedHost;
                            int parsedPort;
                            RfBClient.ParseHostPort(val, s.PlcPort, out parsedHost, out parsedPort);
                            s.PlcIp = parsedHost;
                            if (val.Contains(":")) s.PlcPort = parsedPort;
                            break;
                        case "PORT": if (int.TryParse(val, out n)) s.PlcPort = n; break;
                        case "HMIVNCIP": s.HmiVncIp = val; break;
                        case "VNCPASSWORD": s.VncPassword = val; break;
                        case "RACK": if (int.TryParse(val, out n)) s.Rack = n; break;
                        case "SLOT": if (int.TryParse(val, out n)) s.Slot = n; break;
                        case "OPCUAENDPOINT": s.OpcUaEndpoint = val; break;
                        case "OPCUASECURITYMODE": s.OpcUaSecurityMode = val; break;
                        case "READONLY": s.ReadOnlyMode = val.Equals("true", StringComparison.OrdinalIgnoreCase) || val == "1"; break;
                    }
                }
                else if (section == "SECURITY")
                {
                    int n;
                    if (key.Equals("AutoLogoffMinutes", StringComparison.OrdinalIgnoreCase) && int.TryParse(val, out n) && n >= 0)
                        s.AutoLogoffMinutes = n;
                }
                else if (section == "GARAGE")
                {
                    int n;
                    if (key.Equals("TotalSpaces", StringComparison.OrdinalIgnoreCase) && int.TryParse(val, out n) && n > 0)
                        s.TotalSpaces = n;
                    if (key.Equals("SpacesPerColumn", StringComparison.OrdinalIgnoreCase) && int.TryParse(val, out n) && n > 0)
                        s.SpacesPerColumn = n;
                }
                else if (section == "TAGS")
                {
                    s.Tags[key] = val;
                }
                else if (section == "USERS")
                {
                    // format: username=password|FullName|Role|Phone
                    string[] parts = val.Split('|');
                    var ua = new UserAccount
                    {
                        Username = key,
                        Password = parts.Length > 0 ? parts[0].Trim() : "1234",
                        FullName = parts.Length > 1 ? parts[1].Trim() : key,
                        Role = parts.Length > 2 ? parts[2].Trim().ToUpperInvariant() : "OPERATOR",
                        Phone = parts.Length > 3 ? parts[3].Trim() : "+962795100000",
                        Email = key + "@autopark.jo"
                    };
                    s.Users[key] = ua;
                }
            }

            if (s.Users.Count == 0)
            {
                AddDefaultUsers(s);
            }

            return s;
        }

        static void AddDefaultUsers(AppSettings s)
        {
            s.Users["superadmin"] = new UserAccount { Username = "superadmin", Password = "Admin@12345", FullName = "Mohammad Al-Safadi", Role = "SUPER_ADMIN", Phone = "+962795100001", Email = "superadmin@autopark.jo" };
            s.Users["admin"] = new UserAccount { Username = "admin", Password = "Admin@12345", FullName = "خالد الطراونة (مدير النظام)", Role = "SYSTEM_ADMIN", Phone = "+962795100002", Email = "admin@autopark.jo" };
            s.Users["operator"] = new UserAccount { Username = "operator", Password = "Operator@123", FullName = "فهد العبادي (مشغّل النظام)", Role = "OPERATOR", Phone = "+962795100003", Email = "operator@autopark.jo" };
            s.Users["attendant"] = new UserAccount { Username = "attendant", Password = "Operator@123", FullName = "سعد الزعبي (موظف مواقف)", Role = "PARKING_ATTENDANT", Phone = "+962785100004", Email = "attendant@autopark.jo" };
            s.Users["engineer"] = new UserAccount { Username = "engineer", Password = "Engineer@123", FullName = "م. طارق المومني (مهندس صيانة)", Role = "MAINTENANCE_ENGINEER", Phone = "+962795100005", Email = "engineer@autopark.jo" };
            s.Users["customer"] = new UserAccount { Username = "customer", Password = "Customer@123", FullName = "عميل مواقف (عميل)", Role = "CUSTOMER", Phone = "+962775100006", Email = "customer@autopark.jo" };
            s.Users["viewer"] = new UserAccount { Username = "viewer", Password = "Viewer@1234", FullName = "ياسر الحياري (قراءة فقط)", Role = "READ_ONLY", Phone = "+962795100007", Email = "viewer@autopark.jo" };
        }

        public void Save()
        {
            var sb = new StringBuilder();
            sb.AppendLine("; ==============================================================");
            sb.AppendLine(";  إعدادات منظومة المواقف الذكية المؤتمتة (Auto Park - الأردن)");
            sb.AppendLine("; ==============================================================");
            sb.AppendLine();
            sb.AppendLine("[General]");
            sb.AppendLine("; Primary default language: en | ar");
            sb.AppendLine("Language=" + (Language ?? "en"));
            sb.AppendLine("; Use http://localhost:3000/api/v1 on the company server, or http://46.185.128.165:3000/api/v1 remotely");
            sb.AppendLine("ApiBaseUrl=" + (ApiBaseUrl ?? "http://localhost:3000/api/v1"));
            sb.AppendLine("PublicServerIp=" + (PublicServerIp ?? "46.185.128.165"));
            sb.AppendLine();
            sb.AppendLine("[PLC]");
            sb.AppendLine("; البروتوكول: VNC | MOCK | SIEMENS_S7 | OPC_UA | MODBUS_TCP | MQTT | CUSTOM_TCP");
            sb.AppendLine("Protocol=" + Protocol);
            sb.AppendLine("PlcModel=" + PlcModel);
            sb.AppendLine("IP=" + PlcIp);
            sb.AppendLine("Port=" + PlcPort);
            sb.AppendLine("HmiVncIp=" + (HmiVncIp ?? "192.168.0.30:5900"));
            sb.AppendLine("VncPassword=" + (VncPassword ?? ""));
            sb.AppendLine("Rack=" + Rack);
            sb.AppendLine("Slot=" + Slot);
            sb.AppendLine("OpcUaEndpoint=" + OpcUaEndpoint);
            sb.AppendLine("OpcUaSecurityMode=" + (OpcUaSecurityMode ?? "SignAndEncrypt"));
            sb.AppendLine("ReadOnly=" + (ReadOnlyMode ? "true" : "false"));
            sb.AppendLine();
            sb.AppendLine("[Security]");
            sb.AppendLine("AutoLogoffMinutes=" + AutoLogoffMinutes);
            sb.AppendLine();
            sb.AppendLine("[Garage]");
            sb.AppendLine("TotalSpaces=" + TotalSpaces);
            sb.AppendLine("SpacesPerColumn=" + SpacesPerColumn);
            sb.AppendLine();
            sb.AppendLine("[Tags]");
            foreach (var kv in Tags)
            {
                sb.AppendLine(kv.Key + "=" + kv.Value);
            }
            sb.AppendLine();
            sb.AppendLine("[Users]");
            sb.AppendLine("; الصيغة: اسم_المستخدم=كلمة_المرور|الاسم_الكامل|الصلاحية|رقم_الهاتف_الأردني");
            foreach (var u in Users.Values)
            {
                sb.AppendLine(u.Username + "=" + u.Password + "|" + u.FullName + "|" + u.Role + "|" + u.Phone);
            }

            File.WriteAllText(IniPath, sb.ToString(), new UTF8Encoding(true));
        }

        public static void CreateTemplate(string path)
        {
            var s = new AppSettings { IniPath = path };
            foreach (var k in DefaultTagKeys) s.Tags[k] = GetDefaultTagAddress(k);
            AddDefaultUsers(s);
            s.Save();
        }

        public string TestPlcConnection()
        {
            if (Protocol == "MOCK")
            {
                if (ParkState.Instance.ControllerOffline)
                    throw new Exception("المحاكي في وضع غير متصل (Offline).");
                return "متصل بنجاح (وضع المحاكاة الصناعية MOCK - استجابة 2ms)";
            }

            if (Protocol == "SIEMENS_S7" || PlcPort == 102)
            {
                using (var client = new TcpClient())
                {
                    var sw = System.Diagnostics.Stopwatch.StartNew();
                    var ar = client.BeginConnect(PlcIp, PlcPort, null, null);
                    bool ok = ar.AsyncWaitHandle.WaitOne(3000);
                    if (!ok || !client.Connected)
                        throw new Exception("تعذر الاتصال بالمتحكم الصناعي Siemens S7 على العنوان " + PlcIp + ":" + PlcPort);
                    client.EndConnect(ar);

                    try
                    {
                        var stream = client.GetStream();
                        stream.ReadTimeout = 2500;
                        stream.WriteTimeout = 2500;
                        byte dstTsap = (byte)((Rack * 32) + Slot);
                        byte[] cotpCr = new byte[]
                        {
                            0x03, 0x00, 0x00, 0x16, // TPKT
                            0x11, 0xE0, 0x00, 0x00, 0x00, 0x01, 0x00, // COTP CR
                            0xC0, 0x01, 0x0A,
                            0xC1, 0x02, 0x01, 0x00,
                            0xC2, 0x02, 0x01, dstTsap
                        };
                        stream.Write(cotpCr, 0, cotpCr.Length);
                        byte[] resp = new byte[22];
                        int readLen = stream.Read(resp, 0, resp.Length);
                        sw.Stop();
                        if (readLen >= 7 && resp[0] == 0x03 && (resp[5] == 0xD0 || resp[5] == 0xE0))
                        {
                            return "متصل بنجاح بالمتحكم الصناعي Siemens SIMATIC S7-1200 @ " + PlcIp + ":" + PlcPort + " (Rack " + Rack + ", Slot " + Slot + ") — زمن الاستجابة: " + sw.ElapsedMilliseconds + "ms";
                        }
                    }
                    catch { }
                    sw.Stop();
                    return "متصل بنجاح بالمتحكم الصناعي Siemens S7 @ " + PlcIp + ":" + PlcPort + " — زمن الاستجابة: " + sw.ElapsedMilliseconds + "ms";
                }
            }

            using (var client = new TcpClient())
            {
                var sw = System.Diagnostics.Stopwatch.StartNew();
                var ar = client.BeginConnect(PlcIp, PlcPort, null, null);
                bool ok = ar.AsyncWaitHandle.WaitOne(2500);
                if (!ok || !client.Connected)
                    throw new Exception("تعذر الاتصال بالمتحكم على العنوان " + PlcIp + ":" + PlcPort);
                client.EndConnect(ar);
                sw.Stop();
                return "متصل بنجاح (" + Protocol + " @ " + PlcIp + ":" + PlcPort + " - " + sw.ElapsedMilliseconds + "ms)";
            }
        }
    }

    public class SpaceItem
    {
        public string SpaceNumber; // L11..L43
        public int ColumnNumber;   // Lane 1..4
        public int PositionInColumn; // P1..P3 (1..3)
        public int HmiX;           // Exact X coordinate on 480x272 Siemens KTP400 screen
        public int HmiY;           // Exact Y coordinate on 480x272 Siemens KTP400 screen
        public string Status;      // AVAILABLE, OCCUPIED, RESERVED, MOVING, MAINTENANCE, ERROR
        public string PlateNumber;
        public string OwnerName;
        public string ParkedByUsername; // الموظف الذي حرّك البارك ووضع السيارة
        public bool IsOtherVehicle;     // false = سيارته الشخصية (أصفر)، true = سيارة أخرى (نهدي)
        public string UpdatedAt;
    }

    public class AuthorizedDeviceItem
    {
        public string Id;
        public string EmployeeName;
        public string Username;
        public string MacAddress;
        public string DeviceId;
        public string DeviceModel;
        public string Status; // ACTIVE | REVOKED
        public bool CanControl = true;
        public string RevokeReason;
        public string RevokedBy;
        public string LastSeenAt;
        public string CreatedAt;
    }

    public class VehicleItem
    {
        public string PlateNumber;
        public string Brand;
        public string Model;
        public string Color;
        public string VehicleType;
        public string OwnerUsername;
        public string OwnerName;
        public string CreatedAt;
    }

    public class CommandRecord
    {
        public string CommandId;
        public string RequestNumber;
        public string Type; // PARK | RETRIEVE
        public string PlateNumber;
        public string SpaceNumber;
        public string RequestedBy;
        public string Status; // CREATED, VALIDATED, SENT, ACKNOWLEDGED, EXECUTING, COMPLETED, FAILED
        public string CreatedAt;
        public string CompletedAt;
    }

    public class AlarmItem
    {
        public string Id;
        public string Code;
        public string Severity; // INFO, WARNING, CRITICAL, EMERGENCY
        public string Description;
        public string Source;
        public string Status; // ACTIVE, ACKNOWLEDGED, RESOLVED
        public string CreatedAt;
        public string AcknowledgedBy;
    }

    public class PersistedData
    {
        public List<SpaceItem> Spaces = new List<SpaceItem>();
        public List<VehicleItem> Vehicles = new List<VehicleItem>();
        public List<CommandRecord> Commands = new List<CommandRecord>();
        public List<AlarmItem> Alarms = new List<AlarmItem>();
        public List<AuthorizedDeviceItem> Devices = new List<AuthorizedDeviceItem>();
        public bool EnforceDeviceWhitelist = true;
    }

    public class PlcSensorsSnapshot
    {
        public bool LiveConnected = false;
        public string Mode = "SIMULATED_FALLBACK";
        public bool PhotocellClear = true;      // ParkIO_Data.PCELL_inside_DB (DB1,X0.7)
        public bool PcellOutsideClear = true;   // ParkIO_Data.PCELL_outside_DB (DB1,X1.0)
        public bool FaultDb = false;            // ParkIO_Data.FAULT_DB (DB1,X0.0)
        public bool PhaseFail = false;          // ParkIO_Data.PFAIL_DB (DB1,X0.2)
        public bool PumpOverload = false;       // Hydrulic Pump O.L (%M50.1)
        public bool CompressorOverload = false; // Compressor O.L (%M50.2)
        public bool ObstacleExist = false;      // Obstacle_exist (%M3.3)
        public bool EmergencyPhysical = false;  // Emergency Stop (%M50.0 / DB1,X0.1)
        public bool EmergencyDuringMove = false;// emergency during up or down (%M7.0)
        public bool StopperFault = false;       // stopper_not_energize (%M50.4 / Alarm Section bit 12)
        public bool LiftInvalidPos = false;     // Lift_not_in_vaild_position (%M50.5 / Alarm Section bit 13)
        public bool ErrorInPosition = false;    // Error_in_Position (%M50.3 / Alarm Section bit 11)
        public bool MaintenanceDue = false;     // ParkDB.Period_Maintanence (DB2,X10.1)
        public bool AutoMode = true;            // ParkIO_Data.Auto_DB (DB1,X0.3)
        public bool ManualMode = false;         // ParkIO_Data.Manual_DB (DB1,X0.5)
        public bool Step1Ready = false;         // ParkDB.Park_Step1_Ready (DB2,X5.4)
        public bool Step1Done = false;          // ParkDB.Park_Step1_Done (DB2,X5.5)
        public bool Step2Ready = false;         // ParkDB.Park_Step2_Ready (DB2,X5.6)
        public bool Step2Done = false;          // ParkDB.Park_Step2_Done (DB2,X5.7)
        public bool Step1Ok = false;            // ParkDB.Park_Step1_OK (DB2,X6.0)
        public bool Step2Ok = false;            // ParkDB.Park_Step2_OK (DB2,X6.1)
        public int AlarmWord = 0;
        public int AlarmSection = 0;
        // Raw PLC process image bytes (IB0..IB3 -> I0.0..I3.7, QB0..QB3 -> Q0.0..Q3.7)
        public int[] RawInputs = new int[4];
        public int[] RawOutputs = new int[4];
        public bool HasRawIo = false;
        // [laneIndex 0..3, levelIndex 0=BTM(P1), 1=MID(P2), 2=TOP(P3)]
        public bool[,] LimitSwitches = new bool[4, 3];
        public bool[] LsMapped = new bool[4];
        public bool[] MgProt = new bool[] { false, false, false, false };
        public bool[] MgProtMapped = new bool[4];
        public bool[] CheckLocation = new bool[] { false, false, false, false };
        public int[] CurrentFloor = new int[] { 1, 1, 1, 1 }; // 1=Level 1 (LS_BTM Home), 2=Level 2 (LS_MID), 3=Level 3 (LS_TOP)
        public string LastSyncTime = "—";

        public PlcSensorsSnapshot()
        {
            for (int l = 0; l < 4; l++)
            {
                LimitSwitches[l, 0] = true; // default Home (LS_BTM = Level 1 / Lx1 Top at ground)
                LimitSwitches[l, 1] = false;
                LimitSwitches[l, 2] = false;
            }
        }

        public void SetSimulatedLaneFloor(int lane, int uiFloor)
        {
            if (lane < 1 || lane > 4) return;
            int idx = lane - 1;
            LimitSwitches[idx, 0] = (uiFloor == 1);
            LimitSwitches[idx, 1] = (uiFloor == 2);
            LimitSwitches[idx, 2] = (uiFloor == 3);
            CurrentFloor[idx] = uiFloor;
        }
    }

    public class ParkState
    {
        static ParkState _instance;
        public static ParkState Instance
        {
            get
            {
                if (_instance == null) _instance = new ParkState();
                return _instance;
            }
        }

        readonly string _dataFile;
        public List<SpaceItem> Spaces = new List<SpaceItem>();
        public List<VehicleItem> Vehicles = new List<VehicleItem>();
        public List<CommandRecord> Commands = new List<CommandRecord>();
        public List<AlarmItem> Alarms = new List<AlarmItem>();
        public List<AuthorizedDeviceItem> Devices = new List<AuthorizedDeviceItem>();
        public bool EnforceDeviceWhitelist = true;
        public PlcSensorsSnapshot Sensors = new PlcSensorsSnapshot();

        public bool ControllerOffline = false;
        public bool EmergencyStop = false;
        public string BackendToken = "";
        public bool BackendConnected = false;
        public string ApiBaseUrl = "http://192.168.0.30:3000/api/v1";
        public event Action Changed;

        ParkState()
        {
            string dir = Path.GetDirectoryName(System.Windows.Forms.Application.ExecutablePath);
            _dataFile = Path.Combine(dir, "autopark_data.xml");
            LoadOrSeed();
        }

        public void NotifyChanged()
        {
            Save();
            if (Changed != null) Changed();
        }

        public static readonly int[] LaneCenterX = new int[] { 96, 202, 313, 424 }; // Lane 1..4 on 480x272 KTP400
        public static readonly int[] RowCenterY = new int[] { 186, 136, 84 };       // P1..P3 on 480x272 KTP400 (P3=top=84, P1=bottom=186)

        void LoadOrSeed()
        {
            if (File.Exists(_dataFile))
            {
                try
                {
                    var ser = new XmlSerializer(typeof(PersistedData));
                    using (var fs = File.OpenRead(_dataFile))
                    {
                        var d = (PersistedData)ser.Deserialize(fs);
                        // Ensure it has the real machine L11..L43 spot names
                        if (d != null && d.Spaces != null && d.Spaces.Count == 12 && d.Spaces[0].SpaceNumber == "L11")
                        {
                            Spaces = d.Spaces;
                            Vehicles = d.Vehicles ?? new List<VehicleItem>();
                            Commands = d.Commands ?? new List<CommandRecord>();
                            Alarms = d.Alarms ?? new List<AlarmItem>();
                            Devices = d.Devices ?? new List<AuthorizedDeviceItem>();
                            EnforceDeviceWhitelist = d.EnforceDeviceWhitelist;
                            // Auto-clean legacy names if loaded from an older XML file
                            bool migrated = false;
                            foreach (var v in Vehicles)
                            {
                                if (v.OwnerName != null && v.OwnerName.Contains("عبدالله النسور"))
                                {
                                    v.OwnerName = "";
                                    migrated = true;
                                }
                            }
                            foreach (var sp in Spaces)
                            {
                                if (sp.OwnerName != null && sp.OwnerName.Contains("عبدالله النسور"))
                                {
                                    sp.OwnerName = "";
                                    migrated = true;
                                }
                            }
                            foreach (var c in Commands)
                            {
                                if (c.RequestedBy != null && (c.RequestedBy.Contains("أحمد المجالي") || c.RequestedBy.Contains("عبدالله النسور") || c.RequestedBy.Contains("رامي النقا")))
                                {
                                    c.RequestedBy = "Mohammad Al-Safadi";
                                    migrated = true;
                                }
                            }
                            if (migrated) Save();
                            return;
                        }
                    }
                }
                catch { }
            }

            // Seed exact 12 spaces matching TECHNO Electrical.Jo Siemens HMI "Spot Selection" screen:
            // 4 Lanes (Lane 1..4) × 3 Levels (P1..P3): L11..L13, L21..L23, L31..L33, L41..L43
            Spaces.Clear();
            for (int lane = 1; lane <= 4; lane++)
            {
                for (int p = 1; p <= 3; p++)
                {
                    string code = "L" + lane + p;
                    Spaces.Add(new SpaceItem
                    {
                        SpaceNumber = code,
                        ColumnNumber = lane,
                        PositionInColumn = p,
                        HmiX = LaneCenterX[lane - 1],
                        HmiY = RowCenterY[p - 1],
                        Status = "AVAILABLE",
                        PlateNumber = "",
                        OwnerName = "",
                        UpdatedAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")
                    });
                }
            }

            Vehicles.Clear();
            Vehicles.Add(new VehicleItem
            {
                PlateNumber = "10-45821",
                Brand = "Toyota",
                Model = "Camry",
                Color = "أبيض",
                VehicleType = "صالون",
                OwnerUsername = "customer",
                OwnerName = "",
                CreatedAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm")
            });
            Vehicles.Add(new VehicleItem
            {
                PlateNumber = "22-78910",
                Brand = "Lexus",
                Model = "RX 350",
                Color = "أسود",
                VehicleType = "دفع رباعي",
                OwnerUsername = "customer",
                OwnerName = "",
                CreatedAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm")
            });
            Vehicles.Add(new VehicleItem
            {
                PlateNumber = "15-30492",
                Brand = "Hyundai",
                Model = "Ioniq 6",
                Color = "فضي",
                VehicleType = "كهربائية",
                OwnerUsername = "operator",
                OwnerName = "فهد العبادي",
                CreatedAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm")
            });

            Commands.Clear();
            Commands.Add(new CommandRecord
            {
                CommandId = "CMD-" + DateTime.Now.ToString("yyyyMMdd") + "-0001",
                RequestNumber = "PR-" + DateTime.Now.ToString("yyyyMMdd") + "-01",
                Type = "PARK",
                PlateNumber = "22-78910",
                SpaceNumber = "L21",
                RequestedBy = "Mohammad Al-Safadi",
                Status = "COMPLETED",
                CreatedAt = DateTime.Now.AddMinutes(-25).ToString("yyyy-MM-dd HH:mm:ss"),
                CompletedAt = DateTime.Now.AddMinutes(-24).ToString("yyyy-MM-dd HH:mm:ss")
            });

            Save();
        }

        public void Save()
        {
            try
            {
                var d = new PersistedData
                {
                    Spaces = Spaces,
                    Vehicles = Vehicles,
                    Commands = Commands,
                    Alarms = Alarms,
                    Devices = Devices,
                    EnforceDeviceWhitelist = EnforceDeviceWhitelist
                };
                var ser = new XmlSerializer(typeof(PersistedData));
                using (var fs = File.Create(_dataFile))
                {
                    ser.Serialize(fs, d);
                }
            }
            catch { }
        }

        public void EnsureBackendRunningAndLogin(string username, string password)
        {
            try
            {
                if (!PingBackendHealth())
                {
                    string[] candidates = new string[]
                    {
                        "http://192.168.0.30:3000/api/v1",
                        AppSettings.FallbackTunnelApiUrl,
                        "http://localhost:3000/api/v1",
                        "http://localhost:5173/api/v1"
                    };
                    bool found = false;
                    for (int i = 0; i < candidates.Length; i++)
                    {
                        if (string.Equals(ApiBaseUrl, candidates[i], StringComparison.OrdinalIgnoreCase)) continue;
                        if (PingHealthUrl(candidates[i]))
                        {
                            ApiBaseUrl = candidates[i];
                            BackendConnected = true;
                            found = true;
                            break;
                        }
                    }
                    if (!found)
                    {
                        TryAutoStartBackendProcess();
                        if (PingHealthUrl("http://localhost:3000/api/v1"))
                        {
                            ApiBaseUrl = "http://localhost:3000/api/v1";
                            BackendConnected = true;
                        }
                    }
                }
                string body = "{\"username\":\"" + EscapeJson(username) + "\",\"password\":\"" + EscapeJson(password) + "\"}";
                string json = HttpSend("POST", ApiBaseUrl + "/auth/login", body);
                var m = Regex.Match(json, "\"accessToken\"\\s*:\\s*\"([^\"]+)\"");
                if (m.Success)
                {
                    BackendToken = m.Groups[1].Value;
                    BackendConnected = true;
                    PullSpacesFromDatabase();
                }
            }
            catch
            {
                BackendConnected = false;
            }
        }

        public bool PingHealthUrl(string baseUrl)
        {
            try
            {
                string json = HttpSend("GET", baseUrl.TrimEnd('/') + "/health", null);
                return json != null && json.Contains("\"ok\"");
            }
            catch
            {
                return false;
            }
        }

        public bool PingBackendHealth()
        {
            BackendConnected = PingHealthUrl(ApiBaseUrl);
            return BackendConnected;
        }

        public string GetApiRaw(string path)
        {
            try
            {
                return HttpSend("GET", ApiBaseUrl.TrimEnd('/') + path, null);
            }
            catch (Exception ex)
            {
                return "ERR:" + ex.Message;
            }
        }

        public string PostApiRaw(string path, string jsonBody)
        {
            try
            {
                return HttpSend("POST", ApiBaseUrl.TrimEnd('/') + path, jsonBody ?? "{}");
            }
            catch (Exception ex)
            {
                return "ERR:" + ex.Message;
            }
        }

        void TryAutoStartBackendProcess()
        {
            try
            {
                string dir = Path.GetDirectoryName(System.Windows.Forms.Application.ExecutablePath);
                string backendDir = Path.Combine(dir, "backend");
                string script = Path.Combine(backendDir, "dist", "standalone.js");
                if (!File.Exists(script) && Directory.Exists(@"d:\Auto Parke\backend"))
                {
                    backendDir = @"d:\Auto Parke\backend";
                    script = Path.Combine(backendDir, "dist", "standalone.js");
                }
                if (!File.Exists(script)) return;
                string nodeExe = @"C:\Program Files\nodejs\node.exe";
                if (!File.Exists(nodeExe)) nodeExe = "node.exe";

                var psi = new ProcessStartInfo
                {
                    FileName = nodeExe,
                    Arguments = "\"" + script + "\"",
                    WorkingDirectory = backendDir,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                Process.Start(psi);
                for (int i = 0; i < 12; i++)
                {
                    System.Threading.Thread.Sleep(500);
                    if (PingBackendHealth()) break;
                }
            }
            catch { }
        }

        public void PullSpacesFromDatabase()
        {
            if (string.IsNullOrEmpty(BackendToken)) return;
            try
            {
                string json = HttpSend("GET", ApiBaseUrl + "/parking/spaces", null);
                if (string.IsNullOrEmpty(json)) return;
                // Parse each space object {"id":...,"spaceNumber":"L11","level":1,"zone":"Lane 1","status":"AVAILABLE","vehicle":null|{"id":...,"plateNumber":"22-78910"}}
                var matches = Regex.Matches(json, "\\{[^{}]*\"spaceNumber\"\\s*:\\s*\"([^\"]+)\"[^{}]*(?:\"vehicle\"\\s*:\\s*(\\{[^{}]*\\}|null))?[^{}]*\\}");
                if (matches.Count == 0) return;
                foreach (Match m in matches)
                {
                    string chunk = m.Value;
                    string code = m.Groups[1].Value;
                    var stMatch = Regex.Match(chunk, "\"status\"\\s*:\\s*\"([^\"]+)\"");
                    var plMatch = Regex.Match(chunk, "\"plateNumber\"\\s*:\\s*\"([^\"]+)\"");
                    var byMatch = Regex.Match(chunk, "\"parkedByUsername\"\\s*:\\s*\"([^\"]+)\"");
                    var sp = Spaces.Find(s => s.SpaceNumber == code);
                    if (sp != null && stMatch.Success)
                    {
                        sp.Status = stMatch.Groups[1].Value;
                        sp.PlateNumber = plMatch.Success ? plMatch.Groups[1].Value : "";
                        sp.ParkedByUsername = byMatch.Success ? byMatch.Groups[1].Value : "";
                        sp.IsOtherVehicle = ParseJsonBool(chunk, "isOtherVehicle", false);
                    }
                }
                Save();
            }
            catch { }
        }

        public bool PushOperationToBackend(string opType, string plateNumber)
        {
            return PushOperationToBackend(opType, plateNumber, false, null);
        }

        public bool PushOperationToBackend(string opType, string plateNumber, bool isOtherVehicle, string targetSpaceNumber)
        {
            if (string.IsNullOrEmpty(BackendToken)) return false;
            try
            {
                string endpoint = opType == "PARK" ? "/parking/request" : "/parking/retrieve";
                string body = "{\"plateNumber\":\"" + EscapeJson(plateNumber) + "\",\"source\":\"ADMIN\",\"isOtherVehicle\":" + (isOtherVehicle ? "true" : "false");
                if (!string.IsNullOrEmpty(targetSpaceNumber))
                    body += ",\"targetSpaceNumber\":\"" + EscapeJson(targetSpaceNumber) + "\"";
                body += "}";
                string resp = HttpSend("POST", ApiBaseUrl + endpoint, body);
                return !string.IsNullOrEmpty(resp) && resp.IndexOf("\"id\"", StringComparison.OrdinalIgnoreCase) >= 0;
            }
            catch
            {
                return false;
            }
        }

        public bool PullDevicesFromBackend()
        {
            if (string.IsNullOrEmpty(BackendToken)) return false;
            try
            {
                string json = HttpSend("GET", ApiBaseUrl + "/devices", null);
                if (string.IsNullOrEmpty(json)) return false;
                EnforceDeviceWhitelist = ParseJsonBool(json, "enforceWhitelist", true);
                var list = new List<AuthorizedDeviceItem>();
                var matches = Regex.Matches(json, "\\{[^{}]*\"employeeName\"\\s*:\\s*\"([^\"]+)\"[^{}]*\\}");
                foreach (Match m in matches)
                {
                    string c = m.Value;
                    list.Add(new AuthorizedDeviceItem
                    {
                        Id = ParseJsonStr(c, "id"),
                        EmployeeName = ParseJsonStr(c, "employeeName"),
                        Username = ParseJsonStr(c, "username"),
                        MacAddress = ParseJsonStr(c, "macAddress"),
                        DeviceId = ParseJsonStr(c, "deviceId"),
                        DeviceModel = ParseJsonStr(c, "deviceModel"),
                        Status = ParseJsonStr(c, "status"),
                        CanControl = ParseJsonBool(c, "canControl", true),
                        RevokeReason = ParseJsonStr(c, "revokeReason"),
                        RevokedBy = ParseJsonStr(c, "revokedBy"),
                        LastSeenAt = ParseJsonStr(c, "lastSeenAt"),
                        CreatedAt = ParseJsonStr(c, "createdAt")
                    });
                }
                Devices = list;
                Save();
                return true;
            }
            catch
            {
                return false;
            }
        }

        public string RegisterDeviceOnBackend(string employeeName, string username, string macAddress, string deviceId, string deviceModel)
        {
            string body = "{\"employeeName\":\"" + EscapeJson(employeeName) + "\"";
            if (!string.IsNullOrEmpty(username)) body += ",\"username\":\"" + EscapeJson(username) + "\"";
            if (!string.IsNullOrEmpty(macAddress)) body += ",\"macAddress\":\"" + EscapeJson(macAddress) + "\"";
            if (!string.IsNullOrEmpty(deviceId)) body += ",\"deviceId\":\"" + EscapeJson(deviceId) + "\"";
            if (!string.IsNullOrEmpty(deviceModel)) body += ",\"deviceModel\":\"" + EscapeJson(deviceModel) + "\"";
            body += ",\"canControl\":true}";
            if (string.IsNullOrEmpty(BackendToken))
            {
                Devices.Insert(0, new AuthorizedDeviceItem
                {
                    Id = Guid.NewGuid().ToString("N").Substring(0, 12),
                    EmployeeName = employeeName,
                    Username = username,
                    MacAddress = macAddress,
                    DeviceId = deviceId,
                    DeviceModel = deviceModel,
                    Status = "ACTIVE",
                    CanControl = true,
                    CreatedAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm")
                });
                Save();
                return "LOCAL_OK";
            }
            string resp = HttpSend("POST", ApiBaseUrl + "/devices", body);
            PullDevicesFromBackend();
            return resp;
        }

        public string UpdateDeviceOnBackend(string id, string employeeName, string username, string macAddress, string deviceId, string deviceModel, bool canControl)
        {
            string body = "{\"employeeName\":\"" + EscapeJson(employeeName) + "\""
                + ",\"username\":\"" + EscapeJson(username ?? "") + "\""
                + ",\"macAddress\":\"" + EscapeJson(macAddress ?? "") + "\""
                + ",\"deviceId\":\"" + EscapeJson(deviceId ?? "") + "\""
                + ",\"deviceModel\":\"" + EscapeJson(deviceModel ?? "") + "\""
                + ",\"canControl\":" + (canControl ? "true" : "false") + "}";
            if (string.IsNullOrEmpty(BackendToken))
            {
                var d = Devices.Find(x => x.Id == id);
                if (d != null)
                {
                    d.EmployeeName = employeeName;
                    d.Username = username;
                    d.MacAddress = macAddress;
                    d.DeviceId = deviceId;
                    d.DeviceModel = deviceModel;
                    d.CanControl = canControl;
                }
                Save();
                return "LOCAL_OK";
            }
            string resp = HttpSend("PUT", ApiBaseUrl + "/devices/" + id, body);
            PullDevicesFromBackend();
            return resp;
        }

        public string RevokeDeviceOnBackend(string id, string reason, bool disableUserAccount)
        {
            if (string.IsNullOrEmpty(BackendToken))
            {
                var d = Devices.Find(x => x.Id == id);
                if (d != null) { d.Status = "REVOKED"; d.CanControl = false; d.RevokeReason = reason; }
                Save();
                return "LOCAL_OK";
            }
            string body = "{\"reason\":\"" + EscapeJson(reason) + "\",\"disableUserAccount\":" + (disableUserAccount ? "true" : "false") + "}";
            string resp = HttpSend("POST", ApiBaseUrl + "/devices/" + id + "/revoke", body);
            PullDevicesFromBackend();
            return resp;
        }

        public string ActivateDeviceOnBackend(string id)
        {
            if (string.IsNullOrEmpty(BackendToken))
            {
                var d = Devices.Find(x => x.Id == id);
                if (d != null) { d.Status = "ACTIVE"; d.CanControl = true; d.RevokeReason = ""; }
                Save();
                return "LOCAL_OK";
            }
            string resp = HttpSend("POST", ApiBaseUrl + "/devices/" + id + "/activate", "{}");
            PullDevicesFromBackend();
            return resp;
        }

        public string DeleteDeviceOnBackend(string id)
        {
            if (string.IsNullOrEmpty(BackendToken))
            {
                Devices.RemoveAll(x => x.Id == id);
                Save();
                return "LOCAL_OK";
            }
            string resp = HttpSend("DELETE", ApiBaseUrl + "/devices/" + id, null);
            PullDevicesFromBackend();
            return resp;
        }

        public void SetDeviceWhitelistPolicyOnBackend(bool enforce)
        {
            EnforceDeviceWhitelist = enforce;
            Save();
            if (string.IsNullOrEmpty(BackendToken)) return;
            try
            {
                HttpSend("PUT", ApiBaseUrl + "/devices/policy", "{\"enforceWhitelist\":" + (enforce ? "true" : "false") + "}");
            }
            catch { }
        }

        static string ParseJsonStr(string json, string key)
        {
            var m = Regex.Match(json, "\"" + key + "\"\\s*:\\s*\"([^\"]*)\"");
            return m.Success ? m.Groups[1].Value : "";
        }

        public void PushVehicleToBackend(string plateNumber, string brand, string model, string color)
        {
            if (string.IsNullOrEmpty(BackendToken)) return;
            try
            {
                string body = "{\"plateNumber\":\"" + EscapeJson(plateNumber) + "\",\"brand\":\"" + EscapeJson(brand) + "\",\"model\":\"" + EscapeJson(model) + "\",\"color\":\"" + EscapeJson(color) + "\"}";
                HttpSend("POST", ApiBaseUrl + "/vehicles", body);
            }
            catch { }
        }

        public bool PullSensorsFromBackend()
        {
            if (string.IsNullOrEmpty(BackendToken)) return false;
            try
            {
                string json = HttpSend("GET", ApiBaseUrl + "/industrial/s7/sensors", null);
                if (string.IsNullOrEmpty(json)) return false;

                Sensors.LiveConnected = ParseJsonBool(json, "connected", false);
                var modeM = Regex.Match(json, "\"mode\"\\s*:\\s*\"([^\"]+)\"");
                if (modeM.Success) Sensors.Mode = modeM.Groups[1].Value;
                Sensors.PhotocellClear = ParseJsonBool(json, "photocellClear", true);
                Sensors.ObstacleExist = ParseJsonBool(json, "obstacleExist", false);
                Sensors.EmergencyPhysical = ParseJsonBool(json, "emergencyStop", false);
                Sensors.EmergencyDuringMove = ParseJsonBool(json, "emergencyDuringMove", false);
                Sensors.StopperFault = ParseJsonBool(json, "stopperFault", false);
                Sensors.LiftInvalidPos = ParseJsonBool(json, "liftInvalidPos", false);
                Sensors.ErrorInPosition = ParseJsonBool(json, "errorInPosition", false);
                Sensors.MaintenanceDue = ParseJsonBool(json, "maintenanceDue", false);
                Sensors.AutoMode = ParseJsonBool(json, "autoMode", true);
                Sensors.ManualMode = ParseJsonBool(json, "manualMode", false);
                Sensors.AlarmWord = ParseJsonInt(json, "alarmWord", 0);
                Sensors.AlarmSection = ParseJsonInt(json, "alarmSection", 0);
                Sensors.LastSyncTime = DateTime.Now.ToString("HH:mm:ss");

                // Parse lanes array elements
                var laneMatches = Regex.Matches(json, "\\{[^{}]*\"lane\"\\s*:\\s*([1-4])[^{}]*\\}");
                foreach (Match lm in laneMatches)
                {
                    int lane;
                    if (!int.TryParse(lm.Groups[1].Value, out lane) || lane < 1 || lane > 4) continue;
                    string chunk = lm.Value;
                    int idx = lane - 1;
                    bool lsTop = ParseJsonBool(chunk, "lsTop", false);
                    bool lsMid = ParseJsonBool(chunk, "lsMid", false);
                    bool lsBtm = ParseJsonBool(chunk, "lsBtm", false);
                    bool lsMapped = ParseJsonBool(chunk, "lsMapped", false);
                    bool mgProt = ParseJsonBool(chunk, "mgProt", false);
                    bool mgProtMapped = ParseJsonBool(chunk, "mgProtMapped", false);
                    bool checkLoc = ParseJsonBool(chunk, "checkLocation", false);
                    int curFloor = ParseJsonInt(chunk, "currentFloor", lsTop ? 3 : (lsMid ? 2 : (lsBtm ? 1 : 0)));

                    if (Sensors.LiveConnected)
                    {
                        Sensors.LimitSwitches[idx, 0] = lsBtm;
                        Sensors.LimitSwitches[idx, 1] = lsMid;
                        Sensors.LimitSwitches[idx, 2] = lsTop;
                        Sensors.LsMapped[idx] = lsMapped;
                        Sensors.CurrentFloor[idx] = curFloor;
                    }
                    Sensors.MgProt[idx] = mgProt;
                    Sensors.MgProtMapped[idx] = mgProtMapped;
                    Sensors.CheckLocation[idx] = checkLoc;
                }

                // Also pull raw /industrial/s7/live so real IB0..IB3, DB1 bits, Pump/Comp O.L, and true mapped state are ALWAYS accurate!
                try
                {
                    string liveJson = HttpSend("GET", ApiBaseUrl + "/industrial/s7/live", null);
                    if (!string.IsNullOrEmpty(liveJson) && liveJson.IndexOf("\"IB0\"", StringComparison.Ordinal) >= 0)
                    {
                        Sensors.RawInputs[0] = ParseJsonInt(liveJson, "IB0", 0);
                        Sensors.RawInputs[1] = ParseJsonInt(liveJson, "IB1", 0);
                        Sensors.RawInputs[2] = ParseJsonInt(liveJson, "IB2", 0);
                        Sensors.RawInputs[3] = ParseJsonInt(liveJson, "IB3", 0);
                        Sensors.RawOutputs[0] = ParseJsonInt(liveJson, "QB0", 0);
                        Sensors.RawOutputs[1] = ParseJsonInt(liveJson, "QB1", 0);
                        Sensors.RawOutputs[2] = ParseJsonInt(liveJson, "QB2", 0);
                        Sensors.RawOutputs[3] = ParseJsonInt(liveJson, "QB3", 0);
                        Sensors.HasRawIo = true;

                        // Decode verified ParkIO_Data [DB1] & %M sensor bits directly from live PLC values
                        if (liveJson.Contains("\"fault_db_tag\"")) Sensors.FaultDb = ParseJsonBool(liveJson, "fault_db_tag", false);
                        if (liveJson.Contains("\"pfail_db_tag\"")) Sensors.PhaseFail = ParseJsonBool(liveJson, "pfail_db_tag", false);
                        if (liveJson.Contains("\"pcell_inside_db_tag\"")) Sensors.PhotocellClear = ParseJsonBool(liveJson, "pcell_inside_db_tag", Sensors.PhotocellClear);
                        if (liveJson.Contains("\"pcell_outside_db_tag\"")) Sensors.PcellOutsideClear = ParseJsonBool(liveJson, "pcell_outside_db_tag", true);
                        if (liveJson.Contains("\"pump_overload_tag\"")) Sensors.PumpOverload = ParseJsonBool(liveJson, "pump_overload_tag", false);
                        if (liveJson.Contains("\"compressor_overload_tag\"")) Sensors.CompressorOverload = ParseJsonBool(liveJson, "compressor_overload_tag", false);
                        if (liveJson.Contains("\"error_in_position_tag\"")) Sensors.ErrorInPosition = Sensors.ErrorInPosition || ParseJsonBool(liveJson, "error_in_position_tag", false);
                        if (liveJson.Contains("\"step1_ready_tag\"")) Sensors.Step1Ready = ParseJsonBool(liveJson, "step1_ready_tag", false);
                        if (liveJson.Contains("\"step1_done_tag\"")) Sensors.Step1Done = ParseJsonBool(liveJson, "step1_done_tag", false);
                        if (liveJson.Contains("\"step2_ready_tag\"")) Sensors.Step2Ready = ParseJsonBool(liveJson, "step2_ready_tag", false);
                        if (liveJson.Contains("\"step2_done_tag\"")) Sensors.Step2Done = ParseJsonBool(liveJson, "step2_done_tag", false);
                        if (liveJson.Contains("\"step1_ok_tag\"")) Sensors.Step1Ok = ParseJsonBool(liveJson, "step1_ok_tag", false);
                        if (liveJson.Contains("\"step2_ok_tag\"")) Sensors.Step2Ok = ParseJsonBool(liveJson, "step2_ok_tag", false);

                        // Accurately detect whether each lane's %I limit switch / MG_PROT tags are actually mapped in live PLC values
                        for (int lane = 1; lane <= 4; lane++)
                        {
                            int idx = lane - 1;
                            bool hasLsKey = liveJson.Contains("\"ls_L" + lane + "_top\"") || liveJson.Contains("\"ls_L" + lane + "_mid\"") || liveJson.Contains("\"ls_L" + lane + "_btm\"");
                            bool hasMgKey = liveJson.Contains("\"mg_prot_L" + lane + "\"");
                            Sensors.LsMapped[idx] = hasLsKey;
                            Sensors.MgProtMapped[idx] = hasMgKey;
                            if (hasLsKey)
                            {
                                Sensors.LimitSwitches[idx, 0] = ParseJsonBool(liveJson, "ls_L" + lane + "_btm", false);
                                Sensors.LimitSwitches[idx, 1] = ParseJsonBool(liveJson, "ls_L" + lane + "_mid", false);
                                Sensors.LimitSwitches[idx, 2] = ParseJsonBool(liveJson, "ls_L" + lane + "_top", false);
                            }
                            if (hasMgKey)
                            {
                                Sensors.MgProt[idx] = ParseJsonBool(liveJson, "mg_prot_L" + lane, false);
                            }
                        }
                    }
                }
                catch { }

                // Sync Emergency Stop bidirectionally with the live PLC so software E-Stop never stays stuck/hung
                if (Sensors.LiveConnected && Sensors.EmergencyPhysical && !EmergencyStop)
                {
                    EmergencyStop = true;
                    EnsureAlarmActive("PLC_EMERGENCY_STOP", "EMERGENCY", "تم رصد إيقاف طوارئ فعلي من الـ PLC (ES1/ES2)", "PLC_S7_1200");
                }
                else if (Sensors.LiveConnected && !Sensors.EmergencyPhysical && EmergencyStop)
                {
                    EmergencyStop = false;
                }
                if (Sensors.LiveConnected && Sensors.ErrorInPosition)
                    EnsureAlarmActive("PLC_ERROR_IN_POSITION", "CRITICAL", "خطأ في تموضع المصعد (Alarm Section Bit 11)", "PLC_S7_1200");
                if (Sensors.LiveConnected && Sensors.StopperFault)
                    EnsureAlarmActive("PLC_STOPPER_NOT_ENERGIZED", "CRITICAL", "الموقف الميكانيكي Stopper غير مفعّل (Alarm Section Bit 12)", "PLC_S7_1200");
                if (Sensors.LiveConnected && Sensors.LiftInvalidPos)
                    EnsureAlarmActive("PLC_LIFT_INVALID_POSITION", "CRITICAL", "المصعد في موضع غير صالح (Alarm Section Bit 13)", "PLC_S7_1200");
                if (Sensors.MaintenanceDue)
                    EnsureAlarmActive("PLC_PERIOD_MAINTENANCE", "WARNING", "حان موعد الصيانة الدورية للماكنة (Period_Maintanence)", "PLC_S7_1200");

                return true;
            }
            catch
            {
                return false;
            }
        }

        public void EnsureAlarmActive(string code, string severity, string desc, string source)
        {
            if (Alarms.Exists(a => a.Code == code && a.Status == "ACTIVE")) return;
            Alarms.Insert(0, new AlarmItem
            {
                Id = Guid.NewGuid().ToString("N").Substring(0, 8),
                Code = code,
                Severity = severity,
                Description = desc,
                Source = source,
                Status = "ACTIVE",
                CreatedAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")
            });
            Save();
        }

        readonly object _plcCommandLock = new object();
        public volatile bool IsPlcCommandBusy = false;

        public bool CancelLatestActiveRequestOnBackend()
        {
            if (string.IsNullOrEmpty(BackendToken)) return false;
            try
            {
                string json = HttpSend("GET", ApiBaseUrl + "/parking/requests?active=true&limit=5", null);
                if (string.IsNullOrEmpty(json)) return false;
                var m = Regex.Match(json, "\"id\"\\s*:\\s*\"([^\"]+)\"");
                if (!m.Success) return false;
                string reqId = m.Groups[1].Value;
                HttpSend("POST", ApiBaseUrl + "/parking/requests/" + reqId + "/cancel", "{}");
                return true;
            }
            catch { return false; }
        }

        public string SendRecoveryAction(string action)
        {
            if (string.IsNullOrEmpty(BackendToken)) return "";
            lock (_plcCommandLock)
            {
                IsPlcCommandBusy = true;
                try
                {
                    string body = "{\"action\":\"" + EscapeJson(action) + "\"}";
                    return HttpSend("POST", ApiBaseUrl + "/industrial/s7/recovery", body);
                }
                catch (Exception ex)
                {
                    return "ERR:" + ex.Message;
                }
                finally { IsPlcCommandBusy = false; }
            }
        }

        public string SendManualControl(string controlKey, bool active)
        {
            if (string.IsNullOrEmpty(BackendToken)) return "";
            lock (_plcCommandLock)
            {
                IsPlcCommandBusy = true;
                try
                {
                    string body = "{\"controlKey\":\"" + EscapeJson(controlKey) + "\",\"active\":" + (active ? "true" : "false") + "}";
                    return HttpSend("POST", ApiBaseUrl + "/industrial/s7/manual", body);
                }
                catch (Exception ex)
                {
                    return "ERR:" + ex.Message;
                }
                finally { IsPlcCommandBusy = false; }
            }
        }

        public string SendPlcWrite(string address, int value, int pulseMs)
        {
            if (string.IsNullOrEmpty(BackendToken)) return "";
            lock (_plcCommandLock)
            {
                IsPlcCommandBusy = true;
                try
                {
                    string body = pulseMs > 0
                        ? "{\"address\":\"" + EscapeJson(address) + "\",\"value\":" + value + ",\"pulseMs\":" + pulseMs + "}"
                        : "{\"address\":\"" + EscapeJson(address) + "\",\"value\":" + value + "}";
                    return HttpSend("POST", ApiBaseUrl + "/industrial/s7/write", body);
                }
                catch (Exception ex)
                {
                    return "ERR:" + ex.Message;
                }
                finally { IsPlcCommandBusy = false; }
            }
        }

        public string SendPlcWriteBool(string address, bool value, int pulseMs)
        {
            if (string.IsNullOrEmpty(BackendToken)) return "";
            lock (_plcCommandLock)
            {
                IsPlcCommandBusy = true;
                try
                {
                    string valLit = value ? "true" : "false";
                    string body = pulseMs > 0
                        ? "{\"address\":\"" + EscapeJson(address) + "\",\"value\":" + valLit + ",\"pulseMs\":" + pulseMs + "}"
                        : "{\"address\":\"" + EscapeJson(address) + "\",\"value\":" + valLit + "}";
                    return HttpSend("POST", ApiBaseUrl + "/industrial/s7/write", body);
                }
                catch (Exception ex)
                {
                    return "ERR:" + ex.Message;
                }
                finally { IsPlcCommandBusy = false; }
            }
        }

        public void RecordLocalAudit(string type, string target, string details, string userFullName)
        {
            Commands.Insert(0, new CommandRecord
            {
                CommandId = "AUD-" + DateTime.Now.ToString("yyyyMMdd-HHmmss"),
                RequestNumber = "OP-" + DateTime.Now.ToString("HHmmss"),
                Type = type,
                PlateNumber = details,
                SpaceNumber = target,
                RequestedBy = userFullName,
                Status = "COMPLETED",
                CreatedAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
                CompletedAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")
            });
            Save();
        }

        static bool ParseJsonBool(string json, string key, bool fallback)
        {
            var m = Regex.Match(json, "\"" + key + "\"\\s*:\\s*(true|false)");
            if (!m.Success) return fallback;
            return m.Groups[1].Value == "true";
        }

        static int ParseJsonInt(string json, string key, int fallback)
        {
            var m = Regex.Match(json, "\"" + key + "\"\\s*:\\s*(-?\\d+)");
            int val;
            if (!m.Success || !int.TryParse(m.Groups[1].Value, out val)) return fallback;
            return val;
        }

        string HttpSend(string method, string url, string jsonBody)
        {
            var req = (HttpWebRequest)WebRequest.Create(url);
            req.Method = method;
            bool isWrite = string.Equals(method, "POST", StringComparison.OrdinalIgnoreCase)
                || string.Equals(method, "PUT", StringComparison.OrdinalIgnoreCase);
            req.Timeout = isWrite ? 15000 : 6000;
            req.ReadWriteTimeout = isWrite ? 15000 : 6000;
            req.ContentType = "application/json; charset=utf-8";
            if (!string.IsNullOrEmpty(BackendToken))
                req.Headers["Authorization"] = "Bearer " + BackendToken;

            if (!string.IsNullOrEmpty(jsonBody))
            {
                byte[] bytes = Encoding.UTF8.GetBytes(jsonBody);
                req.ContentLength = bytes.Length;
                using (var s = req.GetRequestStream()) s.Write(bytes, 0, bytes.Length);
            }

            using (var resp = (HttpWebResponse)req.GetResponse())
            using (var sr = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
            {
                return sr.ReadToEnd();
            }
        }

        static string EscapeJson(string s)
        {
            return (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");
        }
    }
}
