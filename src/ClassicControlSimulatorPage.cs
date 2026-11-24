using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Text;
using System.Windows.Forms;

namespace AutoPark
{
    enum ClassicCircuitMode
    {
        DolLatch = 0,
        FwdRevInterlock = 1,
        StarDeltaTimer = 2,
        AutoParkHydraulic = 3,
        SequentialTwoMotor = 4
    }

    class ClassicControlState
    {
        public ClassicCircuitMode Mode = ClassicCircuitMode.DolLatch;

        // Power & protection
        public bool McbOn = true;          // Q1 Main Breaker
        public bool EStopPressed = false;  // Latching NC Mushroom E-Stop
        public bool OverloadTrip = false;  // F1 Thermal Overload (95-96 NC opens, 97-98 NO closes)
        public bool PhaseFail = false;     // PF Phase Failure Relay (for AutoPark Hydraulic)
        public bool PhotocellBlocked = false; // PC Entrance Photocell (for AutoPark Hydraulic)

        // Momentary pushbuttons (true while pressed)
        public bool PbStop = false;        // S0 NC Stop
        public bool PbStart1 = false;      // S1 NO Start / FWD / Lift UP
        public bool PbStart2 = false;      // S2 NO REV / Lift DOWN

        // Limit switches (NC in series with coil)
        public bool LsTopOrFwd = false;    // Limit switch Top / Forward End
        public bool LsMid = false;         // Limit switch Mid Floor (AutoPark)
        public bool LsBtmOrRev = false;    // Limit switch Bottom / Reverse End

        // Contactor coils & auxiliary relays
        public bool Km1 = false;           // Main / FWD / Pump Contactor
        public bool Km2 = false;           // REV / Star (Y) / Lift UP / Motor 2
        public bool Km3 = false;           // Delta (D) / Lift DOWN
        public bool Kt1Coil = false;       // On-Delay Timer Coil
        public bool Kt1Done = false;       // On-Delay Timer Timed-Out Contact

        // Timer & physics
        public double TimerSetpointSec = 5.0;
        public double TimerElapsedSec = 0.0;
        public double MotorRpm = 0.0;      // -1450..+1450 RPM
        public double MotorAngleDeg = 0.0; // Visual rotor angle
        public double MotorAmps = 0.0;     // Simulated line current (A)
        public double LiftPositionPct = 0.0; // 0 = Bottom (P1), 50 = Mid (P2), 100 = Top (P3)
        public bool InterlockBlocked = false;
        public string LastBlockReason = "";

        public bool ControlPowerOk
        {
            get { return McbOn && !EStopPressed && !OverloadTrip && !PhaseFail; }
        }

        public bool ResetAll()
        {
            EStopPressed = false;
            OverloadTrip = false;
            PhaseFail = false;
            PhotocellBlocked = false;
            PbStop = false;
            PbStart1 = false;
            PbStart2 = false;
            LsTopOrFwd = false;
            LsMid = false;
            LsBtmOrRev = false;
            Km1 = false;
            Km2 = false;
            Km3 = false;
            Kt1Coil = false;
            Kt1Done = false;
            TimerElapsedSec = 0.0;
            MotorRpm = 0.0;
            MotorAmps = 0.0;
            LiftPositionPct = 0.0;
            InterlockBlocked = false;
            LastBlockReason = "";
            return true;
        }

        public void Step(double dtSec, Action<string> log)
        {
            bool prevKm1 = Km1, prevKm2 = Km2, prevKm3 = Km3, prevKtDone = Kt1Done;
            InterlockBlocked = false;
            LastBlockReason = "";

            bool power = ControlPowerOk;
            bool stopClosed = !PbStop;

            if (!power)
            {
                Km1 = false;
                Km2 = false;
                Km3 = false;
                Kt1Coil = false;
                Kt1Done = false;
                TimerElapsedSec = 0.0;
            }
            else if (Mode == ClassicCircuitMode.DolLatch)
            {
                // Standard DOL with self-holding auxiliary contact KM1 (13-14)
                bool nextKm1 = stopClosed && (PbStart1 || Km1);
                Km1 = nextKm1;
                Km2 = false;
                Km3 = false;
                Kt1Coil = false;
                Kt1Done = false;
                TimerElapsedSec = 0.0;
            }
            else if (Mode == ClassicCircuitMode.FwdRevInterlock)
            {
                // Forward / Reverse with strict electrical NC cross-interlock (KM2 NC -> KM1, KM1 NC -> KM2)
                // Pressing opposing start button while running MUST be blocked and MUST NEVER plug-reverse without STOP!
                if (PbStart1 && Km2)
                {
                    InterlockBlocked = true;
                    LastBlockReason = Loc.T("Blocked by KM2 NC Interlock — press STOP first!", "ممنوع بواسطة إنترلوك KM2 المغلق — اضغط إيقاف أولاً!");
                }
                if (PbStart2 && Km1)
                {
                    InterlockBlocked = true;
                    LastBlockReason = Loc.T("Blocked by KM1 NC Interlock — press STOP first!", "ممنوع بواسطة إنترلوك KM1 المغلق — اضغط إيقاف أولاً!");
                }
                if (PbStart1 && PbStart2 && !Km1 && !Km2)
                {
                    InterlockBlocked = true;
                    LastBlockReason = Loc.T("Simultaneous FWD + REV blocked by interlock!", "تم منع الضغط المتزامن للأمام والخلف بواسطة الإنترلوك!");
                }

                bool nextKm1 = stopClosed && !LsTopOrFwd && !Km2 && (Km1 || (PbStart1 && !PbStart2));
                bool nextKm2 = stopClosed && !LsBtmOrRev && !Km1 && !nextKm1 && (Km2 || (PbStart2 && !PbStart1));
                Km1 = nextKm1;
                Km2 = nextKm2;
                Km3 = false;
                Kt1Coil = false;
                Kt1Done = false;
                TimerElapsedSec = 0.0;
                StarDeltaDeadElapsedSec = 0.0;
            }
            else if (Mode == ClassicCircuitMode.StarDeltaTimer)
            {
                // Star-Delta Starter: KM1 (Main) + KT1 (On-Delay Timer) + KM2 (Star Y) -> 100ms dead-time -> KM3 (Delta D)
                bool nextKm1 = stopClosed && (PbStart1 || Km1);
                Km1 = nextKm1;
                Kt1Coil = Km1;
                if (Kt1Coil)
                {
                    if (TimerElapsedSec < TimerSetpointSec)
                    {
                        TimerElapsedSec += dtSec;
                        if (TimerElapsedSec >= TimerSetpointSec)
                        {
                            TimerElapsedSec = TimerSetpointSec;
                            Kt1Done = true;
                        }
                    }
                    else
                    {
                        Kt1Done = true;
                    }
                }
                else
                {
                    TimerElapsedSec = 0.0;
                    StarDeltaDeadElapsedSec = 0.0;
                    Kt1Done = false;
                }

                // Electrical interlock with IEC open-transition dead-time pause between Star (KM2) and Delta (KM3)
                bool nextKm2 = Km1 && !Kt1Done && !Km3;
                if (Km1 && Kt1Done && !nextKm2)
                {
                    if (StarDeltaDeadElapsedSec < StarDeltaDeadTimeSec)
                    {
                        StarDeltaDeadElapsedSec += dtSec;
                    }
                }
                else
                {
                    StarDeltaDeadElapsedSec = 0.0;
                }
                bool deadTimeElapsed = StarDeltaDeadElapsedSec >= StarDeltaDeadTimeSec;
                bool nextKm3 = Km1 && Kt1Done && !Km2 && !nextKm2 && deadTimeElapsed;
                Km2 = nextKm2;
                Km3 = nextKm3;
            }
            else if (Mode == ClassicCircuitMode.AutoParkHydraulic)
            {
                // AutoPark Hydraulic Lift Classic Control Panel:
                // Safety chain: MCB + !EMG + !OL + !PhaseFail + !PhotocellBlocked
                // Hold-to-run UP (S1 -> KM1 Pump + KM2 UP Valve) or DOWN (S2 -> KM3 DOWN Valve only, gravity return!)
                bool safeChain = !PhotocellBlocked;
                if ((PbStart1 || PbStart2) && PhotocellBlocked)
                {
                    InterlockBlocked = true;
                    LastBlockReason = Loc.T("Photocell (PC) blocked — Lift motion inhibited!", "حساس البوابة (Photocell) مقطوع — حركة المصعد ممنوعة!");
                }
                if (PbStart1 && PbStart2)
                {
                    InterlockBlocked = true;
                    LastBlockReason = Loc.T("UP & DOWN Solenoids interlocked — cannot energize both!", "إنترلوك بين صمام الصعود والنزول — يمنع التشغيل معاً!");
                }

                // Auto update limit switches from lift position
                LsBtmOrRev = LiftPositionPct <= 1.0;
                LsMid = (LiftPositionPct >= 47.0 && LiftPositionPct <= 53.0);
                LsTopOrFwd = LiftPositionPct >= 99.0;

                bool reqUp = stopClosed && safeChain && PbStart1 && !PbStart2 && !LsTopOrFwd;
                bool reqDown = stopClosed && safeChain && PbStart2 && !PbStart1 && !LsBtmOrRev;

                if (PbStart1 && LsTopOrFwd)
                {
                    InterlockBlocked = true;
                    LastBlockReason = Loc.T("Upper Limit Switch (LS_TOP) reached!", "تم الوصول لمفتاح النهاية العلوي (LS_TOP)!");
                }
                if (PbStart2 && LsBtmOrRev)
                {
                    InterlockBlocked = true;
                    LastBlockReason = Loc.T("Bottom Limit Switch (LS_BTM) reached!", "تم الوصول لمفتاح النهاية السفلي (LS_BTM)!");
                }

                Km2 = reqUp;          // Y_UP Solenoid
                Km3 = reqDown;        // Y_DOWN Solenoid
                Km1 = reqUp;          // Hydraulic Pump Motor runs during UP only (matches TIA Portal Man_Down resets Pump!)
                Kt1Coil = false;
                Kt1Done = false;
                TimerElapsedSec = 0.0;

                if (Km2)
                {
                    LiftPositionPct = Math.Min(100.0, LiftPositionPct + dtSec * 22.0);
                }
                else if (Km3)
                {
                    LiftPositionPct = Math.Max(0.0, LiftPositionPct - dtSec * 22.0);
                }
            }
            else if (Mode == ClassicCircuitMode.SequentialTwoMotor)
            {
                // Sequential 2-Motor Start: Start S1 latches KM1 + KT1 -> after delay, KM2 starts automatically
                bool nextKm1 = stopClosed && (PbStart1 || Km1);
                Km1 = nextKm1;
                Kt1Coil = Km1;
                if (Kt1Coil)
                {
                    if (TimerElapsedSec < TimerSetpointSec)
                    {
                        TimerElapsedSec += dtSec;
                        if (TimerElapsedSec >= TimerSetpointSec)
                        {
                            TimerElapsedSec = TimerSetpointSec;
                            Kt1Done = true;
                        }
                    }
                    else
                    {
                        Kt1Done = true;
                    }
                }
                else
                {
                    TimerElapsedSec = 0.0;
                    Kt1Done = false;
                }
                Km2 = Km1 && Kt1Done;
                Km3 = false;
            }

            // Simulate motor RPM, rotor angle, and current (Amps)
            double targetRpm = 0.0;
            double targetAmps = 0.0;
            if (Mode == ClassicCircuitMode.DolLatch)
            {
                if (Km1) { targetRpm = 1450.0; targetAmps = (MotorRpm < 1100.0) ? 28.5 : 8.4; }
            }
            else if (Mode == ClassicCircuitMode.FwdRevInterlock)
            {
                if (Km1) { targetRpm = 1450.0; targetAmps = (Math.Abs(MotorRpm) < 1100.0) ? 28.0 : 8.6; }
                else if (Km2) { targetRpm = -1450.0; targetAmps = (Math.Abs(MotorRpm) < 1100.0) ? 28.0 : 8.6; }
            }
            else if (Mode == ClassicCircuitMode.StarDeltaTimer)
            {
                if (Km1 && Km2) { targetRpm = 1280.0; targetAmps = 9.5; }      // Star: ~1/3 starting current
                else if (Km1 && Km3) { targetRpm = 1470.0; targetAmps = 14.8; } // Delta: full load current
            }
            else if (Mode == ClassicCircuitMode.AutoParkHydraulic)
            {
                if (Km1) { targetRpm = 1440.0; targetAmps = 11.2; }
                else if (Km3) { targetRpm = 0.0; targetAmps = 0.6; } // Solenoid holding current
            }
            else if (Mode == ClassicCircuitMode.SequentialTwoMotor)
            {
                if (Km1 && Km2) { targetRpm = 1450.0; targetAmps = 16.4; }
                else if (Km1) { targetRpm = 1450.0; targetAmps = 8.2; }
            }

            double accel = 1800.0 * dtSec;
            if (MotorRpm < targetRpm) MotorRpm = Math.Min(targetRpm, MotorRpm + accel);
            else if (MotorRpm > targetRpm) MotorRpm = Math.Max(targetRpm, MotorRpm - accel);

            MotorAmps = MotorAmps + (targetAmps - MotorAmps) * Math.Min(1.0, dtSec * 8.0);
            if (Math.Abs(MotorRpm) > 1.0)
            {
                MotorAngleDeg = (MotorAngleDeg + (MotorRpm / 60.0) * 360.0 * dtSec * 0.25) % 360.0;
            }

            // Emit state-change audit logs
            if (log != null)
            {
                if (Km1 != prevKm1) log(Km1 ? "[KM1] Energized (ON)" : "[KM1] De-energized (OFF)");
                if (Km2 != prevKm2) log(Km2 ? "[KM2] Energized (ON)" : "[KM2] De-energized (OFF)");
                if (Km3 != prevKm3) log(Km3 ? "[KM3] Energized (ON)" : "[KM3] De-energized (OFF)");
                if (Kt1Done && !prevKtDone) log("[KT1] Timer elapsed (" + TimerSetpointSec.ToString("0.0") + "s) -> Contacts switched");
            }
        }
    }

    class ControlDiagramCanvas : Panel
    {
        readonly ClassicControlState _st;
        int _animTick = 0;

        public ControlDiagramCanvas(ClassicControlState state)
        {
            _st = state;
            DoubleBuffered = true;
            BackColor = Color.FromArgb(15, 23, 42); // Deep industrial blueprint slate
        }

        public void AdvanceAnimation()
        {
            _animTick = (_animTick + 1) % 10000;
            Invalidate();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

            int w = ClientSize.Width;
            int h = ClientSize.Height;
            if (w < 200 || h < 200) return;

            // Subtle engineering grid
            using (var gridPen = new Pen(Color.FromArgb(26, 36, 56), 1f))
            {
                for (int x = 24; x < w; x += 24) g.DrawLine(gridPen, x, 0, x, h);
                for (int y = 24; y < h; y += 24) g.DrawLine(gridPen, 0, y, w, y);
            }

            // Split: Left 38% Power Circuit + Motor Animation, Right 62% Classic Control Ladder
            int splitX = Math.Max(250, (int)(w * 0.37));
            using (var divPen = new Pen(Color.FromArgb(51, 65, 85), 1.5f) { DashStyle = DashStyle.Dash })
            {
                g.DrawLine(divPen, splitX, 14, splitX, h - 14);
            }

            DrawSectionTitle(g, 16, 12, Loc.T("POWER CIRCUIT (3~ 380V)", "دائرة القدرة (3 فاز 380V)"), Color.FromArgb(56, 189, 248));
            DrawSectionTitle(g, splitX + 18, 12, Loc.T("CONTROL CIRCUIT (LADDER 220V / 24V)", "دائرة التحكم الكلاسيكية (Ladder)"), Color.FromArgb(250, 204, 21));

            DrawPowerCircuit(g, 16, 44, splitX - 28, h - 60);
            DrawControlLadder(g, splitX + 18, 44, w - splitX - 32, h - 60);
        }

        void DrawSectionTitle(Graphics g, int x, int y, string text, Color color)
        {
            using (var f = Theme.Bold(9.5f))
            using (var br = new SolidBrush(color))
                g.DrawString(text, f, br, x, y);
        }

        Pen WirePen(bool live, float width = 2.6f)
        {
            Color c = live ? Color.FromArgb(249, 115, 22) : Color.FromArgb(100, 116, 139);
            var p = new Pen(c, width);
            p.StartCap = LineCap.Round;
            p.EndCap = LineCap.Round;
            return p;
        }

        void DrawLiveWire(Graphics g, float x1, float y1, float x2, float y2, bool live, Color? overrideLive = null)
        {
            Color c = live ? (overrideLive.HasValue ? overrideLive.Value : Color.FromArgb(249, 115, 22)) : Color.FromArgb(100, 116, 139);
            using (var p = new Pen(c, live ? 2.8f : 2.0f))
            {
                g.DrawLine(p, x1, y1, x2, y2);
            }
            if (live)
            {
                // Subtle glowing pulse dots along energized conductor
                float dx = x2 - x1;
                float dy = y2 - y1;
                float len = (float)Math.Sqrt(dx * dx + dy * dy);
                if (len > 28f)
                {
                    float offset = (_animTick * 4) % 24;
                    using (var br = new SolidBrush(Color.FromArgb(255, 237, 213)))
                    {
                        for (float d = offset; d < len - 6f; d += 24f)
                        {
                            float px = x1 + dx * (d / len);
                            float py = y1 + dy * (d / len);
                            g.FillEllipse(br, px - 2.2f, py - 2.2f, 4.4f, 4.4f);
                        }
                    }
                }
            }
        }

        void DrawPowerCircuit(Graphics g, int x, int y, int w, int h)
        {
            int cx = x + w / 2;
            bool lLive = _st.McbOn && !(_st.Mode == ClassicCircuitMode.AutoParkHydraulic && _st.PhaseFail);
            bool mLive = lLive && (_st.Km1 || _st.Km2 || _st.Km3) && !_st.OverloadTrip;

            // 3-Phase Busbar L1, L2, L3
            int[] px = new int[] { cx - 32, cx, cx + 32 };
            Color[] phColors = new Color[] { Color.FromArgb(239, 68, 68), Color.FromArgb(245, 158, 11), Color.FromArgb(59, 130, 246) };
            string[] phNames = new string[] { "L1", "L2", "L3" };

            int yTop = y + 18;
            int yMcb = y + 66;
            int yKm = y + 140;
            int yOl = y + 216;
            int yMotor = Math.Min(y + h - 105, y + 310);

            using (var fTiny = Theme.Bold(8f))
            {
                for (int i = 0; i < 3; i++)
                {
                    using (var br = new SolidBrush(phColors[i]))
                        g.DrawString(phNames[i], fTiny, br, px[i] - 8, yTop - 16);

                    // Top feed to MCB
                    DrawLiveWire(g, px[i], yTop, px[i], yMcb - 16, true, phColors[i]);
                    // MCB switch blades
                    using (var p = new Pen(_st.McbOn ? phColors[i] : Color.FromArgb(148, 163, 184), 2.4f))
                    {
                        if (_st.McbOn) g.DrawLine(p, px[i], yMcb - 16, px[i], yMcb + 16);
                        else g.DrawLine(p, px[i], yMcb + 16, px[i] - 11, yMcb - 12);
                    }
                    // MCB to Contactor
                    DrawLiveWire(g, px[i], yMcb + 16, px[i], yKm - 16, lLive, phColors[i]);
                    // Contactor main poles (KM1/KM2/KM3)
                    bool polesClosed = _st.Km1 || (_st.Mode == ClassicCircuitMode.FwdRevInterlock && _st.Km2);
                    using (var p = new Pen(polesClosed && lLive ? phColors[i] : Color.FromArgb(148, 163, 184), 2.4f))
                    {
                        if (polesClosed) g.DrawLine(p, px[i], yKm - 16, px[i], yKm + 16);
                        else g.DrawLine(p, px[i], yKm + 16, px[i] - 10, yKm - 11);
                    }
                    // Contactor to Thermal OL
                    DrawLiveWire(g, px[i], yKm + 16, px[i], yOl - 14, polesClosed && lLive, phColors[i]);
                    // Thermal OL heater squiggle
                    using (var p = new Pen(_st.OverloadTrip ? Theme.Err : (mLive ? phColors[i] : Color.FromArgb(148, 163, 184)), 2.2f))
                    {
                        g.DrawLine(p, px[i], yOl - 14, px[i] - 5, yOl - 6);
                        g.DrawLine(p, px[i] - 5, yOl - 6, px[i] + 5, yOl + 4);
                        g.DrawLine(p, px[i] + 5, yOl + 4, px[i], yOl + 14);
                    }
                    // OL to Motor terminals
                    DrawLiveWire(g, px[i], yOl + 14, px[i], yMotor - 46, mLive, phColors[i]);
                }
            }

            // Component Badges on Power Circuit
            DrawTagPill(g, cx + 52, yMcb - 11, _st.McbOn ? "Q1 MCB: ON" : "Q1 MCB: OFF", _st.McbOn ? Theme.Ok : Theme.Err);

            string kmPowerLbl = "KM1: " + (_st.Km1 ? "CLOSED" : "OPEN");
            if (_st.Mode == ClassicCircuitMode.FwdRevInterlock)
                kmPowerLbl = _st.Km1 ? "KM1 (FWD)" : (_st.Km2 ? "KM2 (REV)" : "KM1/KM2 OPEN");
            else if (_st.Mode == ClassicCircuitMode.StarDeltaTimer)
                kmPowerLbl = _st.Km3 ? "KM1 + Δ (KM3)" : (_st.Km2 ? "KM1 + Y (KM2)" : "Y/Δ OPEN");
            else if (_st.Mode == ClassicCircuitMode.AutoParkHydraulic)
                kmPowerLbl = _st.Km1 ? "PUMP + UP" : (_st.Km3 ? "DOWN VALVE" : "IDLE");

            DrawTagPill(g, cx + 52, yKm - 11, kmPowerLbl, (mLive ? Theme.Amber : Color.FromArgb(71, 85, 105)));
            DrawTagPill(g, cx + 52, yOl - 11, _st.OverloadTrip ? "OL F1: TRIP!" : "OL F1: OK", _st.OverloadTrip ? Theme.Err : Theme.Ok);

            // Animated 3-Phase Induction Motor (or Hydraulic Lift Tower in AutoPark mode!)
            if (_st.Mode == ClassicCircuitMode.AutoParkHydraulic)
            {
                DrawAutoParkHydraulicVisual(g, x + 8, yMotor - 44, w - 16, Math.Max(140, h - (yMotor - y) + 34));
            }
            else
            {
                DrawAnimatedMotor(g, cx, yMotor + 10, 48, mLive);
            }
        }

        void DrawAnimatedMotor(Graphics g, int cx, int cy, int radius, bool energized)
        {
            // Outer housing glow
            if (energized)
            {
                using (var glow = new SolidBrush(Color.FromArgb(35, 34, 197, 94)))
                    g.FillEllipse(glow, cx - radius - 10, cy - radius - 10, (radius + 10) * 2, (radius + 10) * 2);
            }

            using (var fill = new SolidBrush(Color.FromArgb(30, 41, 59)))
            using (var border = new Pen(energized ? Theme.Ok : (_st.OverloadTrip ? Theme.Err : Color.FromArgb(148, 163, 184)), 3f))
            {
                g.FillEllipse(fill, cx - radius, cy - radius, radius * 2, radius * 2);
                g.DrawEllipse(border, cx - radius, cy - radius, radius * 2, radius * 2);
            }

            // Rotating rotor blades
            double rad = _st.MotorAngleDeg * Math.PI / 180.0;
            using (var pBlade = new Pen(energized ? Color.FromArgb(74, 222, 128) : Color.FromArgb(100, 116, 139), 3f))
            {
                for (int k = 0; k < 4; k++)
                {
                    double a = rad + k * Math.PI / 2.0;
                    float x2 = cx + (float)(Math.Cos(a) * (radius - 10));
                    float y2 = cy + (float)(Math.Sin(a) * (radius - 10));
                    g.DrawLine(pBlade, cx, cy, x2, y2);
                }
            }

            // Center label M 3~
            using (var brBg = new SolidBrush(Color.FromArgb(15, 23, 42)))
                g.FillEllipse(brBg, cx - 22, cy - 22, 44, 44);
            using (var fM = Theme.Bold(11f))
            using (var brTxt = new SolidBrush(Color.White))
            {
                var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
                g.DrawString("M\n3~", fM, brTxt, new RectangleF(cx - 22, cy - 22, 44, 44), sf);
            }

            // Status strip beneath motor
            string dir = Math.Abs(_st.MotorRpm) < 5 ? Loc.T("STOPPED", "متوقف") : (_st.MotorRpm > 0 ? Loc.T("RUNNING CW ↻", "دوران أمامي ↻") : Loc.T("RUNNING CCW ↺", "دوران عكسي ↺"));
            if (_st.Mode == ClassicCircuitMode.StarDeltaTimer && _st.Km1)
                dir = _st.Km3 ? Loc.T("DELTA (Δ) FULL", "دلتا (Δ) سرعة كاملة") : Loc.T("STAR (Y) START", "ستار (Y) إقلاع");
            if (_st.Mode == ClassicCircuitMode.SequentialTwoMotor && _st.Km1)
                dir = _st.Km2 ? Loc.T("M1 + M2 RUNNING", "المحرك 1 + 2 يعملان") : Loc.T("M1 ON — WAIT M2", "المحرك 1 يعمل — انتظار 2");

            using (var fInfo = Theme.Bold(9f))
            using (var br = new SolidBrush(energized ? Color.FromArgb(74, 222, 128) : Color.FromArgb(203, 213, 225)))
            {
                var sf = new StringFormat { Alignment = StringAlignment.Center };
                g.DrawString(dir, fInfo, br, cx, cy + radius + 10, sf);
                g.DrawString(string.Format("{0:0} RPM  |  {1:0.0} A", Math.Abs(_st.MotorRpm), _st.MotorAmps),
                    Theme.F(8.5f), Brushes.LightSkyBlue, cx, cy + radius + 28, sf);
            }
        }

        void DrawAutoParkHydraulicVisual(Graphics g, int x, int y, int w, int h)
        {
            var box = new Rectangle(x + 8, y + 6, w - 16, Math.Min(150, h - 10));
            using (var br = new SolidBrush(Color.FromArgb(22, 33, 52)))
            using (var pen = new Pen(Color.FromArgb(71, 85, 105), 1.5f))
            {
                g.FillRectangle(br, box);
                g.DrawRectangle(pen, box);
            }

            // Shaft + 3 floor markers (P3 TOP, P2 MID, P1 BTM)
            int shaftX = box.X + 22;
            int shaftW = box.Width - 110;
            int yTop = box.Y + 20;
            int yBtm = box.Bottom - 20;
            int yMid = (yTop + yBtm) / 2;

            using (var railPen = new Pen(Color.FromArgb(100, 116, 139), 2f))
            {
                g.DrawLine(railPen, shaftX, yTop, shaftX, yBtm);
                g.DrawLine(railPen, shaftX + shaftW, yTop, shaftX + shaftW, yBtm);
            }

            // Platform position
            float py = yBtm - (float)((_st.LiftPositionPct / 100.0) * (yBtm - yTop));
            Color platCol = _st.Km2 ? Theme.Ok : (_st.Km3 ? Theme.Blue : Theme.Amber);
            using (var brPlat = new SolidBrush(platCol))
                g.FillRectangle(brPlat, shaftX + 4, py - 9, shaftW - 8, 18);
            using (var fTiny = Theme.Bold(7.5f))
            {
                g.DrawString("PLATFORM " + _st.LiftPositionPct.ToString("0") + "%", fTiny, Brushes.White, shaftX + 10, py - 6);
            }

            // Limit Switch LEDs on right side of shaft
            int lx = shaftX + shaftW + 10;
            DrawLsLed(g, lx, yTop - 7, "LS_TOP", _st.LsTopOrFwd);
            DrawLsLed(g, lx, yMid - 7, "LS_MID", _st.LsMid);
            DrawLsLed(g, lx, yBtm - 7, "LS_BTM", _st.LsBtmOrRev);
        }

        void DrawLsLed(Graphics g, int x, int y, string lbl, bool active)
        {
            using (var br = new SolidBrush(active ? Theme.Ok : Color.FromArgb(71, 85, 105)))
                g.FillEllipse(br, x, y + 2, 10, 10);
            using (var f = Theme.Bold(7.5f))
            using (var brTxt = new SolidBrush(active ? Color.FromArgb(134, 239, 172) : Color.FromArgb(148, 163, 184)))
                g.DrawString(lbl, f, brTxt, x + 14, y);
        }

        void DrawControlLadder(Graphics g, int x, int y, int w, int h)
        {
            int leftRail = x + 14;
            int rightRail = x + w - 18;
            int topY = y + 14;
            int botY = y + h - 18;

            bool railPower = _st.McbOn;
            bool afterSafety = _st.ControlPowerOk;

            // Left Hot Rail (L / +24V) & Right Neutral Rail (N / 0V)
            DrawLiveWire(g, leftRail, topY, leftRail, botY, railPower, Color.FromArgb(239, 68, 68));
            using (var nPen = new Pen(Color.FromArgb(56, 189, 248), 2.5f))
                g.DrawLine(nPen, rightRail, topY, rightRail, botY);

            using (var fRail = Theme.Bold(8.5f))
            {
                g.DrawString("L (220V)", fRail, Brushes.Tomato, leftRail - 6, topY - 14);
                g.DrawString("N (0V)", fRail, Brushes.DeepSkyBlue, rightRail - 22, topY - 14);
            }

            // Rung 1: Master Safety Chain (MCB -> E-Stop NC -> Overload 95-96 NC -> Stop S0 NC)
            int r1Y = topY + 42;
            int seg = (rightRail - leftRail) / 5;
            bool p1 = railPower;
            bool p2 = p1 && !_st.EStopPressed;
            bool p3 = p2 && !_st.OverloadTrip;
            bool p4 = p3 && !(_st.Mode == ClassicCircuitMode.AutoParkHydraulic && _st.PhaseFail);
            bool p5 = p4 && !_st.PbStop;

            DrawLiveWire(g, leftRail, r1Y, leftRail + seg - 24, r1Y, p1);
            DrawContactSymbol(g, leftRail + seg, r1Y, true, !_st.EStopPressed, "E-STOP", "NC 1-2", p1);
            DrawLiveWire(g, leftRail + seg + 24, r1Y, leftRail + seg * 2 - 24, r1Y, p2);

            DrawContactSymbol(g, leftRail + seg * 2, r1Y, true, !_st.OverloadTrip, "OL F1", "95-96", p2);
            DrawLiveWire(g, leftRail + seg * 2 + 24, r1Y, leftRail + seg * 3 - 24, r1Y, p3);

            if (_st.Mode == ClassicCircuitMode.AutoParkHydraulic)
            {
                DrawContactSymbol(g, leftRail + seg * 3, r1Y, true, !_st.PhaseFail, "PF RELAY", "NC", p3);
                DrawLiveWire(g, leftRail + seg * 3 + 24, r1Y, leftRail + seg * 4 - 24, r1Y, p4);
            }
            else
            {
                DrawLiveWire(g, leftRail + seg * 2 + 24, r1Y, leftRail + seg * 4 - 24, r1Y, p3);
            }

            DrawContactSymbol(g, leftRail + seg * 4, r1Y, true, !_st.PbStop, "STOP S0", "NC", p4);

            // Safety bus node after S0
            int busX = leftRail + 34;
            int r2Y = r1Y + 82;
            int r3Y = r2Y + 84;
            int r4Y = r3Y + 84;
            int r5Y = Math.Min(botY - 26, r4Y + 72);

            // Safety status badge neatly in top-right of Control Circuit header (zero overlap with STOP S0)
            DrawTagPill(g, rightRail - 138, y - 34, p5 ? "SAFETY CHAIN: OK" : "SAFETY OPEN!", p5 ? Theme.Ok : Theme.Err);

            // Draw circuit-specific ladder rungs!
            int c1 = leftRail + (int)((rightRail - leftRail) * 0.24);
            int c2 = leftRail + (int)((rightRail - leftRail) * 0.52);
            int coilX = rightRail - 74;

            if (_st.Mode == ClassicCircuitMode.DolLatch)
            {
                // Rung 2: Start S1 NO (with parallel KM1 13-14 latch) -> Coil KM1
                DrawLiveWire(g, leftRail, r2Y, c1 - 24, r2Y, p5);
                DrawContactSymbol(g, c1, r2Y, false, _st.PbStart1, "START S1", "NO", p5);
                // Parallel latch branch below S1
                int latchY = r2Y + 46;
                DrawLiveWire(g, c1 - 44, r2Y, c1 - 44, latchY, p5);
                DrawLiveWire(g, c1 - 44, latchY, c1 - 24, latchY, p5);
                DrawContactSymbol(g, c1, latchY, false, _st.Km1, "KM1 AUX", "13-14", p5);
                DrawLiveWire(g, c1 + 24, latchY, c1 + 44, latchY, p5 && _st.Km1);
                DrawLiveWire(g, c1 + 44, latchY, c1 + 44, r2Y, p5 && _st.Km1);

                DrawLiveWire(g, c1 + 24, r2Y, coilX - 24, r2Y, _st.Km1);
                DrawCoilSymbol(g, coilX, r2Y, "KM1", "MAIN", _st.Km1);
                DrawLiveWire(g, coilX + 24, r2Y, rightRail, r2Y, _st.Km1);

                // Rung 3: Run Pilot Lamp H1 (Green)
                DrawLiveWire(g, leftRail, r3Y + 20, c1 - 24, r3Y + 20, afterSafety);
                DrawContactSymbol(g, c1, r3Y + 20, false, _st.Km1, "KM1", "23-24", afterSafety);
                DrawLiveWire(g, c1 + 24, r3Y + 20, coilX - 22, r3Y + 20, _st.Km1);
                DrawLampSymbol(g, coilX, r3Y + 20, "H1 RUN", Theme.Ok, _st.Km1);
                DrawLiveWire(g, coilX + 22, r3Y + 20, rightRail, r3Y + 20, _st.Km1);
            }
            else if (_st.Mode == ClassicCircuitMode.FwdRevInterlock)
            {
                // Rung 2: FWD S1 (|| KM1 latch) -> LS_FWD NC -> KM2 NC Interlock -> Coil KM1
                DrawLiveWire(g, leftRail, r2Y, c1 - 24, r2Y, p5);
                DrawContactSymbol(g, c1, r2Y, false, _st.PbStart1 || _st.Km1, "S1 / KM1", "FWD+13-14", p5);
                DrawLiveWire(g, c1 + 24, r2Y, c2 - 24, r2Y, p5 && (_st.PbStart1 || _st.Km1));
                DrawContactSymbol(g, c2, r2Y, true, !_st.Km2 && !_st.LsTopOrFwd, "KM2 NC", "INTERLOCK", p5 && (_st.PbStart1 || _st.Km1));
                DrawLiveWire(g, c2 + 24, r2Y, coilX - 24, r2Y, _st.Km1);
                DrawCoilSymbol(g, coilX, r2Y, "KM1", "FWD", _st.Km1);
                DrawLiveWire(g, coilX + 24, r2Y, rightRail, r2Y, _st.Km1);

                // Rung 3: REV S2 (|| KM2 latch) -> LS_REV NC -> KM1 NC Interlock -> Coil KM2
                DrawLiveWire(g, leftRail, r3Y, c1 - 24, r3Y, p5);
                DrawContactSymbol(g, c1, r3Y, false, _st.PbStart2 || _st.Km2, "S2 / KM2", "REV+13-14", p5);
                DrawLiveWire(g, c1 + 24, r3Y, c2 - 24, r3Y, p5 && (_st.PbStart2 || _st.Km2));
                DrawContactSymbol(g, c2, r3Y, true, !_st.Km1 && !_st.LsBtmOrRev, "KM1 NC", "INTERLOCK", p5 && (_st.PbStart2 || _st.Km2));
                DrawLiveWire(g, c2 + 24, r3Y, coilX - 24, r3Y, _st.Km2);
                DrawCoilSymbol(g, coilX, r3Y, "KM2", "REV", _st.Km2);
                DrawLiveWire(g, coilX + 24, r3Y, rightRail, r3Y, _st.Km2);
            }
            else if (_st.Mode == ClassicCircuitMode.StarDeltaTimer)
            {
                // Rung 2: Main KM1 + On-Delay Timer KT1
                DrawLiveWire(g, leftRail, r2Y, c1 - 24, r2Y, p5);
                DrawContactSymbol(g, c1, r2Y, false, _st.PbStart1 || _st.Km1, "S1 / KM1", "LATCH", p5);
                DrawLiveWire(g, c1 + 24, r2Y, coilX - 24, r2Y, _st.Km1);
                DrawCoilSymbol(g, coilX, r2Y, "KM1+KT1", _st.TimerElapsedSec.ToString("0.0") + "s/" + _st.TimerSetpointSec.ToString("0") + "s", _st.Km1);
                DrawLiveWire(g, coilX + 24, r2Y, rightRail, r2Y, _st.Km1);

                // Rung 3: Star (Y) Contactor KM2 (KT1 NC + KM3 NC interlock)
                DrawLiveWire(g, leftRail, r3Y, c1 - 24, r3Y, _st.Km1);
                DrawContactSymbol(g, c1, r3Y, true, !_st.Kt1Done, "KT1 NC", "55-56", _st.Km1);
                DrawLiveWire(g, c1 + 24, r3Y, c2 - 24, r3Y, _st.Km1 && !_st.Kt1Done);
                DrawContactSymbol(g, c2, r3Y, true, !_st.Km3, "KM3 NC", "Δ LOCK", _st.Km1 && !_st.Kt1Done);
                DrawLiveWire(g, c2 + 24, r3Y, coilX - 24, r3Y, _st.Km2);
                DrawCoilSymbol(g, coilX, r3Y, "KM2", "STAR (Y)", _st.Km2);
                DrawLiveWire(g, coilX + 24, r3Y, rightRail, r3Y, _st.Km2);

                // Rung 4: Delta (D) Contactor KM3 (KT1 NO + KM2 NC interlock)
                DrawLiveWire(g, leftRail, r4Y, c1 - 24, r4Y, _st.Km1);
                DrawContactSymbol(g, c1, r4Y, false, _st.Kt1Done, "KT1 NO", "67-68", _st.Km1);
                DrawLiveWire(g, c1 + 24, r4Y, c2 - 24, r4Y, _st.Km1 && _st.Kt1Done);
                DrawContactSymbol(g, c2, r4Y, true, !_st.Km2, "KM2 NC", "Y LOCK", _st.Km1 && _st.Kt1Done);
                DrawLiveWire(g, c2 + 24, r4Y, coilX - 24, r4Y, _st.Km3);
                DrawCoilSymbol(g, coilX, r4Y, "KM3", "DELTA (Δ)", _st.Km3);
                DrawLiveWire(g, coilX + 24, r4Y, rightRail, r4Y, _st.Km3);
            }
            else if (_st.Mode == ClassicCircuitMode.AutoParkHydraulic)
            {
                bool safePc = p5 && !_st.PhotocellBlocked;
                // Rung 2: Lift UP (S1 -> PC NC -> LS_TOP NC -> Y_DN NC -> Pump KM1 + Valve Y_UP)
                DrawLiveWire(g, leftRail, r2Y, c1 - 24, r2Y, safePc);
                DrawContactSymbol(g, c1, r2Y, false, _st.PbStart1, "UP (S1)", "HOLD", safePc);
                DrawLiveWire(g, c1 + 24, r2Y, c2 - 24, r2Y, safePc && _st.PbStart1);
                DrawContactSymbol(g, c2, r2Y, true, !_st.LsTopOrFwd && !_st.Km3, "LS_TOP", "+DN LOCK", safePc && _st.PbStart1);
                DrawLiveWire(g, c2 + 24, r2Y, coilX - 24, r2Y, _st.Km2);
                DrawCoilSymbol(g, coilX, r2Y, "KM1+UP", "PUMP/UP", _st.Km2);
                DrawLiveWire(g, coilX + 24, r2Y, rightRail, r2Y, _st.Km2);

                // Rung 3: Lift DOWN (S2 -> PC NC -> LS_BTM NC -> Y_UP NC -> Valve Y_DOWN, Pump OFF!)
                DrawLiveWire(g, leftRail, r3Y, c1 - 24, r3Y, safePc);
                DrawContactSymbol(g, c1, r3Y, false, _st.PbStart2, "DOWN (S2)", "HOLD", safePc);
                DrawLiveWire(g, c1 + 24, r3Y, c2 - 24, r3Y, safePc && _st.PbStart2);
                DrawContactSymbol(g, c2, r3Y, true, !_st.LsBtmOrRev && !_st.Km2, "LS_BTM", "+UP LOCK", safePc && _st.PbStart2);
                DrawLiveWire(g, c2 + 24, r3Y, coilX - 24, r3Y, _st.Km3);
                DrawCoilSymbol(g, coilX, r3Y, "Y_DOWN", "GRAVITY", _st.Km3);
                DrawLiveWire(g, coilX + 24, r3Y, rightRail, r3Y, _st.Km3);

                // Rung 4: Photocell Safety Lamp
                DrawLiveWire(g, leftRail, r4Y, c1 - 24, r4Y, railPower);
                DrawContactSymbol(g, c1, r4Y, true, !_st.PhotocellBlocked, "PCELL", "SAFETY", railPower);
                DrawLiveWire(g, c1 + 24, r4Y, coilX - 22, r4Y, railPower && !_st.PhotocellBlocked);
                DrawLampSymbol(g, coilX, r4Y, "DOOR OK", Theme.Ok, railPower && !_st.PhotocellBlocked);
                DrawLiveWire(g, coilX + 22, r4Y, rightRail, r4Y, railPower && !_st.PhotocellBlocked);
            }
            else if (_st.Mode == ClassicCircuitMode.SequentialTwoMotor)
            {
                // Rung 2: Motor 1 (KM1) + Timer KT1
                DrawLiveWire(g, leftRail, r2Y, c1 - 24, r2Y, p5);
                DrawContactSymbol(g, c1, r2Y, false, _st.PbStart1 || _st.Km1, "S1 / KM1", "M1 LATCH", p5);
                DrawLiveWire(g, c1 + 24, r2Y, coilX - 24, r2Y, _st.Km1);
                DrawCoilSymbol(g, coilX, r2Y, "KM1+KT1", _st.TimerElapsedSec.ToString("0.0") + "s", _st.Km1);
                DrawLiveWire(g, coilX + 24, r2Y, rightRail, r2Y, _st.Km1);

                // Rung 3: Motor 2 (KM2) energized after KT1 delay (requires KM1 NO!)
                DrawLiveWire(g, leftRail, r3Y, c1 - 24, r3Y, p5);
                DrawContactSymbol(g, c1, r3Y, false, _st.Km1, "KM1 NO", "M1 READY", p5);
                DrawLiveWire(g, c1 + 24, r3Y, c2 - 24, r3Y, _st.Km1);
                DrawContactSymbol(g, c2, r3Y, false, _st.Kt1Done, "KT1 NO", "DELAY", _st.Km1);
                DrawLiveWire(g, c2 + 24, r3Y, coilX - 24, r3Y, _st.Km2);
                DrawCoilSymbol(g, coilX, r3Y, "KM2", "MOTOR 2", _st.Km2);
                DrawLiveWire(g, coilX + 24, r3Y, rightRail, r3Y, _st.Km2);
            }

            // Bottom Rung: Fault / Overload Trip Pilot Lamp (OL 97-98 NO -> Red Lamp H3)
            bool faultActive = _st.OverloadTrip || _st.EStopPressed || (_st.Mode == ClassicCircuitMode.AutoParkHydraulic && _st.PhaseFail);
            DrawLiveWire(g, leftRail, r5Y, c1 - 24, r5Y, railPower);
            DrawContactSymbol(g, c1, r5Y, false, faultActive, "OL / FAULT", "97-98 NO", railPower);
            DrawLiveWire(g, c1 + 24, r5Y, coilX - 22, r5Y, railPower && faultActive, Theme.Err);
            DrawLampSymbol(g, coilX, r5Y, "H3 TRIP", Theme.Err, railPower && faultActive);
            DrawLiveWire(g, coilX + 22, r5Y, rightRail, r5Y, railPower && faultActive, Theme.Err);

            // Live interlock warning banner inside canvas if blocked
            if (_st.InterlockBlocked && !string.IsNullOrEmpty(_st.LastBlockReason))
            {
                var warnRect = new Rectangle(x + 28, botY - 46, w - 56, 30);
                using (var br = new SolidBrush(Color.FromArgb(220, 180, 83, 9)))
                using (var fW = Theme.Bold(9f))
                {
                    g.FillRectangle(br, warnRect);
                    var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
                    g.DrawString("⚠ " + _st.LastBlockReason, fW, Brushes.White, warnRect, sf);
                }
            }
        }

        void DrawContactSymbol(Graphics g, int cx, int cy, bool isNc, bool closed, string label, string sub, bool feedLive)
        {
            Color col = (feedLive && closed) ? Color.FromArgb(74, 222, 128) : (closed ? Color.FromArgb(203, 213, 225) : Color.FromArgb(248, 113, 113));
            using (var p = new Pen(col, 2.4f))
            {
                // Left and right contact bars | |
                g.DrawLine(p, cx - 24, cy, cx - 8, cy);
                g.DrawLine(p, cx + 8, cy, cx + 24, cy);
                g.DrawLine(p, cx - 8, cy - 12, cx - 8, cy + 12);
                g.DrawLine(p, cx + 8, cy - 12, cx + 8, cy + 12);
                if (isNc)
                {
                    // Diagonal NC slash
                    g.DrawLine(p, cx - 10, cy + 10, cx + 10, cy - 10);
                }
                if (closed)
                {
                    // Closed bridge indicator
                    using (var pBr = new Pen(Color.FromArgb(74, 222, 128), 2.5f))
                        g.DrawLine(pBr, cx - 8, cy, cx + 8, cy);
                }
            }
            using (var fLbl = Theme.Bold(7.8f))
            using (var fSub = Theme.F(7f))
            {
                var sf = new StringFormat { Alignment = StringAlignment.Center };
                g.DrawString(label, fLbl, Brushes.White, cx, cy - 27, sf);
                g.DrawString(sub, fSub, Brushes.LightSlateGray, cx, cy + 14, sf);
            }
        }

        void DrawCoilSymbol(Graphics g, int cx, int cy, string name, string sub, bool energized)
        {
            if (energized)
            {
                using (var glow = new SolidBrush(Color.FromArgb(65, 249, 115, 22)))
                    g.FillEllipse(glow, cx - 28, cy - 28, 56, 56);
            }
            using (var br = new SolidBrush(energized ? Color.FromArgb(234, 88, 12) : Color.FromArgb(30, 41, 59)))
            using (var p = new Pen(energized ? Color.FromArgb(254, 215, 170) : Color.FromArgb(148, 163, 184), 2.4f))
            {
                g.FillEllipse(br, cx - 22, cy - 22, 44, 44);
                g.DrawEllipse(p, cx - 22, cy - 22, 44, 44);
            }
            using (var f = Theme.Bold(7.8f))
            using (var fSub = Theme.F(7f))
            {
                var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
                g.DrawString(name, f, Brushes.White, new RectangleF(cx - 22, cy - 22, 44, 44), sf);
                sf.LineAlignment = StringAlignment.Near;
                g.DrawString(sub, fSub, energized ? Brushes.Gold : Brushes.LightSlateGray, cx, cy + 24, sf);
            }
        }

        void DrawLampSymbol(Graphics g, int cx, int cy, string name, Color lampColor, bool on)
        {
            if (on)
            {
                using (var glow = new SolidBrush(Color.FromArgb(80, lampColor.R, lampColor.G, lampColor.B)))
                    g.FillEllipse(glow, cx - 26, cy - 26, 52, 52);
            }
            using (var br = new SolidBrush(on ? lampColor : Color.FromArgb(30, 41, 59)))
            using (var p = new Pen(on ? Color.White : Color.FromArgb(148, 163, 184), 2.2f))
            {
                g.FillEllipse(br, cx - 18, cy - 18, 36, 36);
                g.DrawEllipse(p, cx - 18, cy - 18, 36, 36);
                // IEC Lamp X cross
                g.DrawLine(p, cx - 12, cy - 12, cx + 12, cy + 12);
                g.DrawLine(p, cx + 12, cy - 12, cx - 12, cy + 12);
            }
            using (var f = Theme.Bold(7.5f))
            {
                var sf = new StringFormat { Alignment = StringAlignment.Center };
                g.DrawString(name, f, on ? Brushes.White : Brushes.LightSlateGray, cx, cy + 21, sf);
            }
        }

        void DrawTagPill(Graphics g, int x, int y, string text, Color bg)
        {
            using (var f = Theme.Bold(7.8f))
            {
                var sz = g.MeasureString(text, f);
                var r = new Rectangle(x, y, (int)sz.Width + 14, 21);
                using (var path = Theme.Round(r, 6))
                using (var br = new SolidBrush(bg))
                {
                    g.FillPath(br, path);
                    var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
                    g.DrawString(text, f, Brushes.White, r, sf);
                }
            }
        }
    }

    class ClassicControlSimulatorPage : Panel
    {
        readonly MainForm _shell;
        readonly ClassicControlState _st = new ClassicControlState();
        readonly ControlDiagramCanvas _canvas;
        readonly Timer _simTimer;

        readonly ComboBox _cboCircuit;
        readonly ModernButton _btnMcb;
        readonly ModernButton _btnEStop;
        readonly ModernButton _btnOverload;
        readonly ModernButton _btnPhaseOrPc;
        readonly ModernButton _btnStart1;
        readonly ModernButton _btnStart2;
        readonly ModernButton _btnStop;
        readonly ModernButton _btnLs1;
        readonly ModernButton _btnLs2;
        readonly NumericUpDown _numTimer;
        readonly ProgressBar _timerBar;
        readonly Label _lblTelemetry;
        readonly Label _lblCoils;
        readonly TextBox _txtLog;
        readonly ModernButton _btnLiveMirror;
        bool _livePlcMirror = false;

        public ClassicControlSimulatorPage(MainForm shell)
        {
            _shell = shell;
            BackColor = Theme.Back;
            Dock = DockStyle.Fill;

            DockStyle startDock = Loc.IsArabic ? DockStyle.Right : DockStyle.Left;
            DockStyle endDock = Loc.IsArabic ? DockStyle.Left : DockStyle.Right;

            // 1. Top Bar: Circuit Selector + Timer Setpoint + Reset + Export Log
            var topCard = new Card { Dock = DockStyle.Top, Height = 64, Padding = new Padding(14, 10, 14, 10) };

            var lblMode = Theme.Label(Loc.T("Classic Control Circuit:", "دائرة الكلاسيك كنترول:"), Theme.Bold(10f), Theme.Ink);
            lblMode.Dock = startDock;
            lblMode.Width = 175;

            _cboCircuit = new ComboBox
            {
                Dock = startDock,
                Width = 340,
                DropDownStyle = ComboBoxStyle.DropDownList,
                Font = Theme.Semi(10f)
            };
            _cboCircuit.Items.Add(Loc.T("1. DOL Direct-On-Line Starter (Self-Holding Latch)", "1. تشغيل مباشر DOL مع لاتش (Self-Holding)"));
            _cboCircuit.Items.Add(Loc.T("2. Forward / Reverse Motor + Electrical Interlock", "2. عكس دوران محرك (أمامي/خلفي) مع إنترلوك كهربائي"));
            _cboCircuit.Items.Add(Loc.T("3. Star-Delta (Y / Δ) Starter + On-Delay Timer", "3. ستار - دلتا (Y / Δ) مع تايمر تأخير زمني (KT1)"));
            _cboCircuit.Items.Add(Loc.T("4. AutoPark Hydraulic Lift & Pump Classic Panel", "4. لوحة كلاسيك كنترول لمصعد الماكنة الهيدروليكي"));
            _cboCircuit.Items.Add(Loc.T("5. Sequential 2-Motor Start (Timer Cascade)", "5. تشغيل متتابع لمحركين (Motor 1 → Timer → Motor 2)"));
            _cboCircuit.SelectedIndex = 0;
            _cboCircuit.SelectedIndexChanged += delegate
            {
                _st.Mode = (ClassicCircuitMode)_cboCircuit.SelectedIndex;
                _st.ResetAll();
                AppendLog(Loc.T("Loaded circuit: ", "تم تحميل الدائرة: ") + _cboCircuit.SelectedItem.ToString());
                RefreshControls();
            };

            var lblTimer = Theme.Label(Loc.T("Timer KT1 (s):", "التايمر KT1 (ث):"), Theme.Semi(9.5f), Theme.Muted);
            lblTimer.Dock = startDock;
            lblTimer.Width = 104;
            lblTimer.TextAlign = ContentAlignment.MiddleRight;

            _numTimer = new NumericUpDown
            {
                Minimum = 1,
                Maximum = 20,
                Value = 5,
                Width = 60,
                Font = Theme.Bold(10f)
            };
            _numTimer.ValueChanged += delegate { _st.TimerSetpointSec = (double)_numTimer.Value; };

            var btnReset = MakeBtn(Loc.T("Reset Sim", "تصفير المحاكاة"), Icons.Refresh, Theme.Surface, Theme.SurfaceHover, Theme.Ink, true);
            btnReset.Click += delegate
            {
                _livePlcMirror = false;
                _btnLiveMirror.Text = Loc.T("PLC Mirror: OFF", "مرآة PLC: متوقف");
                _btnLiveMirror.BaseColor = Theme.Surface;
                _btnLiveMirror.ForeColor = Theme.Ink;
                _st.ResetAll();
                AppendLog(Loc.T("Simulation reset to safe idle state.", "تمت إعادة تصفير المحاكاة إلى الوضع الآمن."));
                RefreshControls();
            };

            _btnLiveMirror = MakeBtn(Loc.T("PLC Mirror: OFF", "مرآة PLC: متوقف"), Icons.Plug, Theme.Surface, Theme.PrimarySoft, Theme.Ink, true);
            _btnLiveMirror.Click += delegate
            {
                _livePlcMirror = !_livePlcMirror;
                if (_livePlcMirror)
                {
                    if (_cboCircuit.SelectedIndex != (int)ClassicCircuitMode.AutoParkHydraulic)
                        _cboCircuit.SelectedIndex = (int)ClassicCircuitMode.AutoParkHydraulic;
                    _btnLiveMirror.Text = Loc.T("PLC Mirror: LIVE", "مرآة PLC: حي");
                    _btnLiveMirror.BaseColor = Theme.Ok;
                    _btnLiveMirror.ForeColor = Color.White;
                    AppendLog(Loc.T("Live Read-Only S7-1200 Mirror ENABLED (zero PLC writes).", "تم تفعيل مرآة قراءة حية من S7-1200 (قراءة فقط بدون تحريك الماكنة)."));
                }
                else
                {
                    _btnLiveMirror.Text = Loc.T("PLC Mirror: OFF", "مرآة PLC: متوقف");
                    _btnLiveMirror.BaseColor = Theme.Surface;
                    _btnLiveMirror.ForeColor = Theme.Ink;
                    AppendLog(Loc.T("Live PLC Mirror OFF — offline virtual simulation active.", "تم إيقاف مرآة الـ PLC — عودة للمحاكاة الافتراضية."));
                }
            };

            var btnExport = MakeBtn(Loc.T("Export Log", "تصدير السجل"), Icons.Download, Theme.PrimarySoft, Theme.BlueSoft, Theme.Primary, false);
            btnExport.Click += delegate { ExportSimLog(); };

            topCard.Controls.Add(Theme.Holder(btnExport, endDock, 118, new Padding(4, 2, 0, 2)));
            topCard.Controls.Add(Theme.Holder(btnReset, endDock, 114, new Padding(4, 2, 4, 2)));
            topCard.Controls.Add(Theme.Holder(_btnLiveMirror, endDock, 146, new Padding(4, 2, 4, 2)));
            topCard.Controls.Add(Theme.Holder(_numTimer, startDock, 62, new Padding(6, 8, 6, 4)));
            topCard.Controls.Add(lblTimer);
            topCard.Controls.Add(Theme.Holder(_cboCircuit, startDock, 332, new Padding(6, 6, 8, 4)));
            topCard.Controls.Add(lblMode);

            // 2. Main Split Body: Left Interactive Schematic Canvas + Right Operator Panel
            var body = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 1,
                Padding = new Padding(0, 10, 0, 0)
            };
            body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 67f));
            body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33f));
            body.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));

            // Left: Canvas Card
            var canvasCard = new Card { Dock = DockStyle.Fill, Padding = new Padding(10), Margin = new Padding(0, 0, 10, 0) };
            _canvas = new ControlDiagramCanvas(_st) { Dock = DockStyle.Fill };
            canvasCard.Controls.Add(_canvas);

            // Right: Operator Panel Card
            var ctrlCard = new Card { Dock = DockStyle.Fill, Padding = new Padding(14), AutoScroll = true };
            var stack = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                ColumnCount = 1,
                RowCount = 0,
                GrowStyle = TableLayoutPanelGrowStyle.AddRows
            };
            stack.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));

            // Section A: Power & Fault Injection
            stack.Controls.Add(SectionHeader(Loc.T("1. Power & Fault Protection Panel", "1. القاطع الرئيسي والحمايات (Fault Simulation)")));

            var gridProt = Make2ColGrid(90);
            _btnMcb = MakeBtn("Q1 MCB: ON", Icons.Power, Theme.Ok, Color.FromArgb(21, 128, 61), Color.White, false);
            _btnMcb.Click += delegate
            {
                _st.McbOn = !_st.McbOn;
                AppendLog(_st.McbOn ? "[Q1] MCB Switched ON (380V/220V)" : "[Q1] MCB Switched OFF (Power Isolated)");
                RefreshControls();
            };

            _btnEStop = MakeBtn("E-STOP: NORMAL", Icons.Shield, Theme.Surface, Theme.ErrSoft, Theme.Err, true);
            _btnEStop.Click += delegate
            {
                _st.EStopPressed = !_st.EStopPressed;
                AppendLog(_st.EStopPressed ? "[EMG] EMERGENCY STOP LATCHED!" : "[EMG] Emergency Stop Released");
                RefreshControls();
            };

            _btnOverload = MakeBtn("OL F1: OK", Icons.Warning, Theme.Surface, Theme.AmberSoft, Theme.Amber, true);
            _btnOverload.Click += delegate
            {
                _st.OverloadTrip = !_st.OverloadTrip;
                AppendLog(_st.OverloadTrip ? "[OL F1] Thermal Overload TRIPPED (95-96 Open, 97-98 Closed)!" : "[OL F1] Thermal Overload Reset");
                RefreshControls();
            };

            _btnPhaseOrPc = MakeBtn("PC / Phase: OK", Icons.Plug, Theme.Surface, Theme.SurfaceHover, Theme.Ink, true);
            _btnPhaseOrPc.Click += delegate
            {
                if (_st.Mode == ClassicCircuitMode.AutoParkHydraulic)
                {
                    _st.PhotocellBlocked = !_st.PhotocellBlocked;
                    AppendLog(_st.PhotocellBlocked ? "[PC] Entrance Photocell BLOCKED!" : "[PC] Entrance Photocell CLEAR");
                }
                else
                {
                    _st.PhaseFail = !_st.PhaseFail;
                    AppendLog(_st.PhaseFail ? "[PF] Phase Failure simulated" : "[PF] Phase Supply restored");
                }
                RefreshControls();
            };

            gridProt.Controls.Add(_btnMcb, 0, 0);
            gridProt.Controls.Add(_btnEStop, 1, 0);
            gridProt.Controls.Add(_btnOverload, 0, 1);
            gridProt.Controls.Add(_btnPhaseOrPc, 1, 1);
            stack.Controls.Add(gridProt);

            // Section B: Pushbuttons (Hold-to-Press Momentary!)
            stack.Controls.Add(SectionHeader(Loc.T("2. Operator Pushbuttons (Hold to Press)", "2. أزرار التشغيل اللحظية (اضغط واستمر)")));

            var gridPb = Make2ColGrid(96);
            _btnStart1 = MakeBtn(Loc.T("START (S1)", "تشغيل (S1)"), Icons.Check, Theme.Ok, Color.FromArgb(21, 128, 61), Color.White, false);
            WireMomentary(_btnStart1, delegate (bool down)
            {
                _st.PbStart1 = down;
                if (down) AppendLog("[S1] Pushbutton PRESSED");
            });

            _btnStop = MakeBtn(Loc.T("STOP (S0 NC)", "إيقاف (S0)"), Icons.Close, Theme.Err, Color.FromArgb(185, 28, 28), Color.White, false);
            WireMomentary(_btnStop, delegate (bool down)
            {
                _st.PbStop = down;
                if (down) AppendLog("[S0] STOP Pushbutton PRESSED (NC opened)");
            });

            _btnStart2 = MakeBtn(Loc.T("REV / DOWN (S2)", "عكسي / نزول (S2)"), Icons.Refresh, Theme.Blue, Color.FromArgb(29, 78, 216), Color.White, false);
            WireMomentary(_btnStart2, delegate (bool down)
            {
                _st.PbStart2 = down;
                if (down) AppendLog("[S2] REV/DOWN Pushbutton PRESSED");
            });

            var pnlLs = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1, Margin = new Padding(0) };
            pnlLs.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
            pnlLs.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
            _btnLs1 = MakeBtn("LS1", Icons.Lock, Theme.Surface, Theme.SurfaceHover, Theme.Ink, true);
            _btnLs1.Click += delegate { _st.LsTopOrFwd = !_st.LsTopOrFwd; AppendLog("[LS1] " + (_st.LsTopOrFwd ? "TRIGGERED" : "RELEASED")); RefreshControls(); };
            _btnLs2 = MakeBtn("LS2", Icons.Lock, Theme.Surface, Theme.SurfaceHover, Theme.Ink, true);
            _btnLs2.Click += delegate { _st.LsBtmOrRev = !_st.LsBtmOrRev; AppendLog("[LS2] " + (_st.LsBtmOrRev ? "TRIGGERED" : "RELEASED")); RefreshControls(); };
            pnlLs.Controls.Add(_btnLs1, 0, 0);
            pnlLs.Controls.Add(_btnLs2, 1, 0);

            gridPb.Controls.Add(_btnStart1, 0, 0);
            gridPb.Controls.Add(_btnStop, 1, 0);
            gridPb.Controls.Add(_btnStart2, 0, 1);
            gridPb.Controls.Add(pnlLs, 1, 1);
            stack.Controls.Add(gridPb);

            // Section C: Live Timer & Electrical Telemetry
            stack.Controls.Add(SectionHeader(Loc.T("3. Live Telemetry & Contactor Coils", "3. القراءات الكهربائية وحالة الكونتاكتورات")));

            _timerBar = new ProgressBar { Dock = DockStyle.Top, Height = 16, Minimum = 0, Maximum = 100, Value = 0, Margin = new Padding(0, 4, 0, 6) };
            stack.Controls.Add(_timerBar);

            _lblTelemetry = Theme.Label("", Theme.Semi(9f), Theme.Ink);
            _lblTelemetry.Dock = DockStyle.Top;
            _lblTelemetry.Height = 44;
            _lblTelemetry.BackColor = Theme.Back;
            _lblTelemetry.Padding = new Padding(8, 4, 8, 4);
            stack.Controls.Add(_lblTelemetry);

            _lblCoils = Theme.Label("", Theme.Bold(9f), Theme.Primary);
            _lblCoils.Dock = DockStyle.Top;
            _lblCoils.Height = 32;
            _lblCoils.Padding = new Padding(4, 4, 4, 4);
            stack.Controls.Add(_lblCoils);

            // Section D: Live Sequence & Interlock Log
            stack.Controls.Add(SectionHeader(Loc.T("4. Switching & Interlock Event Log", "4. سجل التبديل والإنترلوك الحي")));

            _txtLog = new TextBox
            {
                Dock = DockStyle.Top,
                Height = 148,
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Vertical,
                BackColor = Color.FromArgb(15, 23, 42),
                ForeColor = Color.FromArgb(134, 239, 172),
                Font = new Font("Consolas", 8.5f),
                BorderStyle = BorderStyle.FixedSingle
            };
            stack.Controls.Add(_txtLog);

            ctrlCard.Controls.Add(stack);

            body.Controls.Add(canvasCard, 0, 0);
            body.Controls.Add(ctrlCard, 1, 0);

            Controls.Add(body);
            Controls.Add(topCard);

            // 50ms (20 FPS) real-time simulation loop
            _simTimer = new Timer { Interval = 50 };
            _simTimer.Tick += delegate
            {
                if (IsDisposed || !Visible) return;
                if (_livePlcMirror && _st.Mode == ClassicCircuitMode.AutoParkHydraulic)
                {
                    var s = ParkState.Instance.Sensors;
                    _st.McbOn = s.LiveConnected;
                    _st.EStopPressed = s.EmergencyPhysical || ParkState.Instance.EmergencyStop;
                    _st.PhotocellBlocked = !s.PhotocellClear || s.ObstacleExist;
                    _st.OverloadTrip = s.StopperFault || s.ErrorInPosition;
                    int fl = s.CurrentFloor != null && s.CurrentFloor.Length > 0 ? s.CurrentFloor[0] : 1;
                    _st.LiftPositionPct = fl >= 3 ? 100.0 : (fl == 2 ? 50.0 : 0.0);
                }
                _st.Step(0.05, AppendLog);
                _canvas.AdvanceAnimation();
                RefreshTelemetry();
            };
            _simTimer.Start();

            Disposed += delegate
            {
                _simTimer.Stop();
                _simTimer.Dispose();
            };

            AppendLog(Loc.T("Classic Control Simulator ready — TECHNO Electrical.Jo", "محاكي الكلاسيك كنترول جاهز — TECHNO Electrical.Jo"));
            RefreshControls();
        }

        Label SectionHeader(string text)
        {
            var l = Theme.Label(text, Theme.Bold(9.5f), Theme.Ink);
            l.UseMnemonic = false;
            l.Dock = DockStyle.Top;
            l.Height = 26;
            l.Padding = new Padding(0, 6, 0, 2);
            return l;
        }

        TableLayoutPanel Make2ColGrid(int height)
        {
            var g = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                Height = height,
                ColumnCount = 2,
                RowCount = 2,
                Margin = new Padding(0, 2, 0, 6)
            };
            g.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
            g.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
            g.RowStyles.Add(new RowStyle(SizeType.Percent, 50f));
            g.RowStyles.Add(new RowStyle(SizeType.Percent, 50f));
            return g;
        }

        ModernButton MakeBtn(string text, string icon, Color bg, Color hover, Color fg, bool border)
        {
            var b = new ModernButton
            {
                Text = text,
                IconGlyph = icon,
                IconSize = 9.5f,
                Font = Theme.Semi(9f),
                BaseColor = bg,
                HoverColor = hover,
                PressColor = Theme.PrimarySoft,
                ForeColor = fg,
                BorderColor = border ? Theme.Border : Color.Transparent,
                Dock = DockStyle.Fill,
                Margin = new Padding(3)
            };
            return b;
        }

        void WireMomentary(ModernButton btn, Action<bool> onState)
        {
            btn.MouseDown += delegate (object s, MouseEventArgs e)
            {
                if (e.Button != MouseButtons.Left) return;
                onState(true);
                RefreshControls();
            };
            btn.MouseUp += delegate { onState(false); RefreshControls(); };
            btn.MouseLeave += delegate { onState(false); RefreshControls(); };
            btn.LostFocus += delegate { onState(false); RefreshControls(); };
            btn.MouseCaptureChanged += delegate { if (!btn.Capture) { onState(false); RefreshControls(); } };
        }

        void AppendLog(string msg)
        {
            if (IsDisposed || _txtLog == null) return;
            string line = DateTime.Now.ToString("HH:mm:ss") + "  " + msg + Environment.NewLine;
            _txtLog.AppendText(line);
            if (_txtLog.TextLength > 8000)
            {
                _txtLog.Text = _txtLog.Text.Substring(_txtLog.TextLength - 4000);
                _txtLog.SelectionStart = _txtLog.TextLength;
                _txtLog.ScrollToCaret();
            }
        }

        void RefreshControls()
        {
            _btnMcb.Text = _st.McbOn ? "Q1 MCB: ON" : "Q1 MCB: OFF";
            _btnMcb.BaseColor = _st.McbOn ? Theme.Ok : Theme.Err;

            _btnEStop.Text = _st.EStopPressed ? "E-STOP: ACTIVE!" : "E-STOP: NORMAL";
            _btnEStop.BaseColor = _st.EStopPressed ? Theme.Err : Theme.Surface;
            _btnEStop.ForeColor = _st.EStopPressed ? Color.White : Theme.Err;

            _btnOverload.Text = _st.OverloadTrip ? "OL F1: TRIPPED!" : "OL F1: OK";
            _btnOverload.BaseColor = _st.OverloadTrip ? Theme.Amber : Theme.Surface;
            _btnOverload.ForeColor = _st.OverloadTrip ? Color.White : Theme.Amber;

            if (_st.Mode == ClassicCircuitMode.AutoParkHydraulic)
            {
                _btnPhaseOrPc.Text = _st.PhotocellBlocked ? "Photocell: BLOCKED" : "Photocell: CLEAR";
                _btnPhaseOrPc.BaseColor = _st.PhotocellBlocked ? Theme.Err : Theme.Surface;
                _btnPhaseOrPc.ForeColor = _st.PhotocellBlocked ? Color.White : Theme.Ok;

                _btnStart1.Text = Loc.T("LIFT UP (S1)", "صعود المصعد (S1)");
                _btnStart2.Text = Loc.T("LIFT DOWN (S2)", "نزول المصعد (S2)");
                _btnStart2.Enabled = true;
                _btnLs1.Text = "LS_TOP";
                _btnLs2.Text = "LS_BTM";
                _btnLs1.Enabled = false;
                _btnLs2.Enabled = false;
            }
            else if (_st.Mode == ClassicCircuitMode.FwdRevInterlock)
            {
                _btnPhaseOrPc.Text = _st.PhaseFail ? "Phase: FAULT" : "Phase: 380V OK";
                _btnPhaseOrPc.BaseColor = _st.PhaseFail ? Theme.Err : Theme.Surface;
                _btnPhaseOrPc.ForeColor = _st.PhaseFail ? Color.White : Theme.Ink;

                _btnStart1.Text = Loc.T("FWD (S1)", "أمامي (S1)");
                _btnStart2.Text = Loc.T("REV (S2)", "عكسي (S2)");
                _btnStart2.Enabled = true;
                _btnLs1.Text = _st.LsTopOrFwd ? "LS_F: ON" : "LS_FWD";
                _btnLs2.Text = _st.LsBtmOrRev ? "LS_R: ON" : "LS_REV";
                _btnLs1.Enabled = true;
                _btnLs2.Enabled = true;
            }
            else
            {
                _btnPhaseOrPc.Text = _st.PhaseFail ? "Phase: FAULT" : "Phase: 380V OK";
                _btnPhaseOrPc.BaseColor = _st.PhaseFail ? Theme.Err : Theme.Surface;
                _btnPhaseOrPc.ForeColor = _st.PhaseFail ? Color.White : Theme.Ink;

                _btnStart1.Text = Loc.T("START (S1)", "تشغيل (S1)");
                _btnStart2.Text = Loc.T("N/A (S2)", "غير مستخدم");
                _btnStart2.Enabled = false;
                _btnLs1.Text = "LS1";
                _btnLs2.Text = "LS2";
                _btnLs1.Enabled = false;
                _btnLs2.Enabled = false;
            }

            RefreshTelemetry();
        }

        void RefreshTelemetry()
        {
            int pct = _st.TimerSetpointSec > 0 ? (int)Math.Min(100, (_st.TimerElapsedSec / _st.TimerSetpointSec) * 100.0) : 0;
            if (_timerBar.Value != pct) _timerBar.Value = pct;

            string volt = _st.McbOn ? "380V / 220V AC" : "0V (ISOLATED)";
            string extra = _st.Mode == ClassicCircuitMode.AutoParkHydraulic
                ? "Lift: " + _st.LiftPositionPct.ToString("0") + "%"
                : "KT1: " + _st.TimerElapsedSec.ToString("0.0") + "s / " + _st.TimerSetpointSec.ToString("0.0") + "s";

            _lblTelemetry.Text = string.Format("Supply: {0}  |  {1}\nSpeed: {2:0} RPM  |  Current: {3:0.0} A",
                volt, extra, Math.Abs(_st.MotorRpm), _st.MotorAmps);

            _lblCoils.Text = string.Format("KM1: {0}   |   KM2: {1}   |   KM3: {2}   |   KT1: {3}",
                _st.Km1 ? "● ON" : "○ OFF",
                _st.Km2 ? "● ON" : "○ OFF",
                _st.Km3 ? "● ON" : "○ OFF",
                _st.Kt1Done ? "● DONE" : (_st.Kt1Coil ? "⏳ RUN" : "○ OFF"));
        }

        void ExportSimLog()
        {
            using (var sfd = new SaveFileDialog())
            {
                sfd.FileName = "ClassicControl_SimLog_" + DateTime.Now.ToString("yyyyMMdd_HHmmss") + ".txt";
                sfd.Filter = "Text Log (*.txt)|*.txt";
                if (sfd.ShowDialog(_shell) == DialogResult.OK)
                {
                    var sb = new StringBuilder();
                    sb.AppendLine("TECHNO Electrical.Jo — Classic Control Simulator Report");
                    sb.AppendLine("Circuit: " + _cboCircuit.SelectedItem);
                    sb.AppendLine("Generated: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
                    sb.AppendLine("------------------------------------------------------");
                    sb.AppendLine(_txtLog.Text);
                    File.WriteAllText(sfd.FileName, sb.ToString(), Encoding.UTF8);
                    Loc.ShowMsg("Simulation log exported successfully.", "تم تصدير سجل المحاكاة بنجاح.", "Export", "تصدير", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
            }
        }
    }
}
