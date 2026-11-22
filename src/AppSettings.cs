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
        public string ApiBaseUrl = "http://localhost:3000/api/v1";
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
            "manual_mode_tag", "manual_ok_tag",
            "man_pump_tag", "man_wall_tag", "man_cutoff_tag", "man_up_tag", "man_down_tag",
            "man_s1_tag", "man_s2_tag", "man_s3_tag", "man_s4_tag",
            "man_l1_tag", "man_l2_tag", "man_l3_tag", "man_l4_tag",
            "allow_wall_tag", "user_logoff_tag"
        };

        public static string GetDefaultTagAddress(string key)
        {
            switch (key)
            {
                case "system_ready_tag": return "ParkDB.LANE_OK";
                case "emergency_status_tag": return "EMRGENCY";
                case "emergency_during_move_tag": return "emergency during up or down";
                case "safety_ok_tag": return "PCELL_IN_1";
                case "obstacle_exist_tag": return "Obstacle_exist";
                case "obstacle_reset_tag": return "rest obstcal";
                case "stopper_fault_tag": return "stopper_not_energize";
                case "lift_invalid_pos_tag": return "Lift_not_in_vaild_position";
                case "heartbeat_tag": return "Clock_2Hz";
                case "machine_state_tag": return "ParkIO_Data.Auto_DB";
                case "parking_space_status_tag": return "ParkDB.LANE_FULL";
                case "vehicle_position_tag": return "ParkDB.Level_Number";
                case "alarm_tag": return "ParkDB.\"Alarm Word\"";
                case "alarm_section_tag": return "Alarm Section";
                case "reset_command_tag": return "ParkDB.Reset";
                case "maintenance_due_tag": return "ParkDB.Period_Maintanence";
                case "maintenance_reset_tag": return "ParkDB.New_Maintanence_period";
                case "auto_mode_tag": return "ParkIO_Data.Auto_DB";
                case "lane_number_tag": return "ParkDB.Lane_Number";
                case "level_number_tag": return "ParkDB.Level_Number";
                case "park_command_tag": return "ParkDB.Park_IN";
                case "retrieve_command_tag": return "ParkDB.Park_OUT";
                case "command_id_tag": return "ParkDB.Lane_Number";
                case "target_space_tag": return "ParkDB.Level_Number";
                case "command_acknowledgement_tag": return "ParkDB.Park_Step1_OK";
                case "command_complete_tag": return "ParkDB.Park_Step2_OK";
                case "command_error_tag": return "Alarm Section";
                case "step1_ready_tag": return "ParkDB.Park_Step1_Ready";
                case "step1_ok_tag": return "ParkDB.Park_Step1_OK";
                case "step1_start_tag": return "Park_IN_Step1_Start";
                case "step2_ready_tag": return "ParkDB.Park_Step2_Ready";
                case "step2_ok_tag": return "ParkDB.Park_Step2_OK";
                case "step2_start_tag": return "Park_IN_Step2_Start";
                case "cancel_step_tag": return "cancel_this_step";
                case "complete_seq_tag": return "complete the seq";
                case "manual_mode_tag": return "ParkIO_Data.Manual_DB";
                case "manual_ok_tag": return "ParkIO_Data.ManualOK_DB";
                case "man_pump_tag": return "ParkIO_Data.Man_Pump_DB";
                case "man_wall_tag": return "ParkIO_Data.Man_Wall_DB";
                case "man_cutoff_tag": return "ParkIO_Data.Man_Cuttoff_DB";
                case "man_up_tag": return "ParkIO_Data.Man_Up_DB";
                case "man_down_tag": return "ParkIO_Data.Man_Down_DB";
                case "man_s1_tag": return "ParkIO_Data.Man_LQ1_DB";
                case "man_s2_tag": return "ParkIO_Data.Man_LQ2_DB";
                case "man_s3_tag": return "ParkIO_Data.Man_LQ3_DB";
                case "man_s4_tag": return "ParkIO_Data.Man_LQ4_DB";
                case "man_l1_tag": return "ParkIO_Data.Man_L1_DB";
                case "man_l2_tag": return "ParkIO_Data.Man_L2_DB";
                case "man_l3_tag": return "ParkIO_Data.Man_L3_DB";
                case "man_l4_tag": return "ParkIO_Data.Man_L4_DB";
                case "allow_wall_tag": return "Data_block_1.\"Allow wall\"";
                case "user_logoff_tag": return "ParkIO_Data.User_Logoff";
            }
            if (key.StartsWith("spot_L") && key.EndsWith("_tag") && key.Length == 12)
                return "ParkDB." + key.Substring(5, 3);
            if (key.StartsWith("ls_L") && key.Length >= 9)
            {
                string laneNum = key.Substring(4, 1);
                string pos = key.Substring(6).ToUpperInvariant();
                return "PL" + laneNum + "_LS_" + pos;
            }
            if (key.StartsWith("mg_prot_L") && key.Length == 10)
                return "PL" + key.Substring(9, 1) + "_MG_PROT";
            if (key.StartsWith("check_loc_L") && key.Length == 12)
                return "Lane" + key.Substring(11, 1) + "_check_location";
            return "ParkDB." + key.ToUpperInvariant();
        }

        /// <summary>تحويل رقم الطابق بالواجهة (P3 علوي=3، P2 أوسط=2، P1 سفلي=1) إلى قيمة Level_Number بالـ PLC (1=علوي، 2=أوسط، 3=سفلي)</summary>
        public static int MapUiFloorToPlcLevel(int uiFloor)
        {
            if (uiFloor == 3) return 1;
            if (uiFloor == 2) return 2;
            return 3;
        }

        public static int MapPlcLevelToUiFloor(int plcLevel)
        {
            if (plcLevel == 1) return 3;
            if (plcLevel == 2) return 2;
            return 1;
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
                        case "PROTOCOL": s.Protocol = val.ToUpperInvariant(); break;
                        case "PLCMODEL": s.PlcModel = val; break;
                        case "IP":
                            string parsedHost;
                            int parsedPort;
                            RfBClient.ParseHostPort(val, s.PlcPort, out parsedHost, out parsedPort);
                            s.PlcIp = parsedHost;
                            if (val.Contains(":")) s.PlcPort = parsedPort;
                            break;
                        case "PORT": if (int.TryParse(val, out n)) s.PlcPort = n; break;
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
        public bool PhotocellClear = true;      // PCELL_IN_1: true=clear, false=obstacle at entrance
        public bool ObstacleExist = false;      // Obstacle_exist
        public bool EmergencyPhysical = false;  // EMRGENCY
        public bool EmergencyDuringMove = false;// emergency during up or down
        public bool StopperFault = false;       // stopper_not_energize / Alarm Section bit 12
        public bool LiftInvalidPos = false;     // Lift_not_in_vaild_position / Alarm Section bit 13
        public bool ErrorInPosition = false;    // Alarm Section bit 11
        public bool MaintenanceDue = false;     // ParkDB.Period_Maintanence
        public bool AutoMode = true;            // ParkIO_Data.Auto_DB
        public bool ManualMode = false;         // ParkIO_Data.Manual_DB
        public int AlarmWord = 0;
        public int AlarmSection = 0;
        // [laneIndex 0..3, levelIndex 0=BTM(P1), 1=MID(P2), 2=TOP(P3)]
        public bool[,] LimitSwitches = new bool[4, 3];
        public bool[] MgProt = new bool[] { true, true, true, true };
        public bool[] CheckLocation = new bool[] { true, true, true, true };
        public int[] CurrentFloor = new int[] { 1, 1, 1, 1 }; // 1=P1(BTM), 2=P2(MID), 3=P3(TOP), 0=Between
        public string LastSyncTime = "—";

        public PlcSensorsSnapshot()
        {
            for (int l = 0; l < 4; l++)
            {
                LimitSwitches[l, 0] = true; // default BTM (P1)
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
        public string ApiBaseUrl = "http://localhost:3000/api/v1";
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
                    TryAutoStartBackendProcess();
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

        public bool PingBackendHealth()
        {
            try
            {
                string json = HttpSend("GET", ApiBaseUrl + "/health", null);
                BackendConnected = json != null && json.Contains("\"ok\"");
                return BackendConnected;
            }
            catch
            {
                BackendConnected = false;
                return false;
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

        public void PushOperationToBackend(string opType, string plateNumber)
        {
            PushOperationToBackend(opType, plateNumber, false, null);
        }

        public void PushOperationToBackend(string opType, string plateNumber, bool isOtherVehicle, string targetSpaceNumber)
        {
            if (string.IsNullOrEmpty(BackendToken)) return;
            try
            {
                string endpoint = opType == "PARK" ? "/parking/request" : "/parking/retrieve";
                string body = "{\"plateNumber\":\"" + EscapeJson(plateNumber) + "\",\"source\":\"ADMIN\",\"isOtherVehicle\":" + (isOtherVehicle ? "true" : "false");
                if (!string.IsNullOrEmpty(targetSpaceNumber))
                    body += ",\"targetSpaceNumber\":\"" + EscapeJson(targetSpaceNumber) + "\"";
                body += "}";
                HttpSend("POST", ApiBaseUrl + endpoint, body);
            }
            catch { }
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
                    bool lsBtm = ParseJsonBool(chunk, "lsBtm", true);
                    bool mgProt = ParseJsonBool(chunk, "mgProt", true);
                    bool checkLoc = ParseJsonBool(chunk, "checkLocation", true);
                    int curFloor = ParseJsonInt(chunk, "currentFloor", lsTop ? 3 : (lsMid ? 2 : (lsBtm ? 1 : 0)));

                    if (Sensors.LiveConnected)
                    {
                        Sensors.LimitSwitches[idx, 0] = lsBtm;
                        Sensors.LimitSwitches[idx, 1] = lsMid;
                        Sensors.LimitSwitches[idx, 2] = lsTop;
                        Sensors.CurrentFloor[idx] = curFloor;
                    }
                    Sensors.MgProt[idx] = mgProt;
                    Sensors.CheckLocation[idx] = checkLoc;
                }

                // Sync physical Emergency Stop upward if PLC asserts it
                if (Sensors.LiveConnected && Sensors.EmergencyPhysical && !EmergencyStop)
                {
                    EmergencyStop = true;
                    EnsureAlarmActive("PLC_EMERGENCY_STOP", "EMERGENCY", "تم رصد إيقاف طوارئ فعلي من الـ PLC (ES1/ES2)", "PLC_S7_1200");
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

        public string SendRecoveryAction(string action)
        {
            if (string.IsNullOrEmpty(BackendToken)) return "";
            try
            {
                string body = "{\"action\":\"" + EscapeJson(action) + "\"}";
                return HttpSend("POST", ApiBaseUrl + "/industrial/s7/recovery", body);
            }
            catch (Exception ex)
            {
                return "ERR:" + ex.Message;
            }
        }

        public string SendManualControl(string controlKey, bool active)
        {
            if (string.IsNullOrEmpty(BackendToken)) return "";
            try
            {
                string body = "{\"controlKey\":\"" + EscapeJson(controlKey) + "\",\"active\":" + (active ? "true" : "false") + "}";
                return HttpSend("POST", ApiBaseUrl + "/industrial/s7/manual", body);
            }
            catch (Exception ex)
            {
                return "ERR:" + ex.Message;
            }
        }

        public string SendPlcWrite(string address, int value, int pulseMs)
        {
            if (string.IsNullOrEmpty(BackendToken)) return "";
            try
            {
                string body = "{\"address\":\"" + EscapeJson(address) + "\",\"value\":" + value + ",\"pulseMs\":" + pulseMs + "}";
                return HttpSend("POST", ApiBaseUrl + "/industrial/s7/write", body);
            }
            catch (Exception ex)
            {
                return "ERR:" + ex.Message;
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
            req.Timeout = 3500;
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
