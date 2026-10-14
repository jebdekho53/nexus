using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

// Matrix installer stub: the application payload is a ZIP appended to this executable.
static class Installer {
#if MATRIX_UPDATE
    const bool UpdateOnly = true;
#else
    const bool UpdateOnly = false;
#endif
    static string Log = Path.Combine(Path.GetTempPath(), "matrix-install.log");
    [STAThread]
    static int Main(string[] args) {
        bool silent = Array.IndexOf(args, "/S") >= 0, noLaunch = Array.IndexOf(args, "/nolaunch") >= 0;
        string self = Assembly.GetExecutingAssembly().Location;
        string version = FileVersionInfo.GetVersionInfo(self).ProductVersion;
        Exception error = null;
        Thread worker = new Thread(() => { try { Install(self, noLaunch, args); } catch (Exception ex) { error = ex; } });
        Form form = null;
        if (!silent) {
            Application.EnableVisualStyles();
            form = new Form { Text = "Matrix Setup " + version, Width = 400, Height = 130, StartPosition = FormStartPosition.CenterScreen, FormBorderStyle = FormBorderStyle.FixedDialog, MaximizeBox = false, MinimizeBox = false, ControlBox = false };
            form.Icon = System.Drawing.Icon.ExtractAssociatedIcon(self);
            form.Controls.Add(new PictureBox { Image = form.Icon.ToBitmap(), Left = 18, Top = 12, Width = 42, Height = 42, SizeMode = PictureBoxSizeMode.Zoom });
            form.Controls.Add(new Label { Text = (UpdateOnly ? "Updating Matrix " : "Installing Matrix ") + version + " ...", Left = 70, Top = 23, Width = 280 });
            form.Controls.Add(new ProgressBar { Style = ProgressBarStyle.Marquee, Left = 20, Top = 50, Width = 345, Height = 18 });
            form.Shown += (s, e) => worker.Start();
            var timer = new System.Windows.Forms.Timer { Interval = 300 };
            timer.Tick += (s, e) => { if (!worker.IsAlive && worker.ThreadState != System.Threading.ThreadState.Unstarted) { timer.Stop(); form.Close(); } };
            timer.Start();
            Application.Run(form);
        } else { worker.Start(); worker.Join(); }
        if (error != null) {
            File.WriteAllText(Log, error.ToString());
            if (!silent) MessageBox.Show("Install failed: " + error.Message + "\r\nLog: " + Log, "Matrix Setup", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
        return 0;
    }

    static void Install(string self, bool noLaunch, string[] args) {
        string dest = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Matrix");
        foreach (string arg in args) if (arg.StartsWith("/target=", StringComparison.OrdinalIgnoreCase)) dest = Path.GetFullPath(arg.Substring(8));
        dest = Path.GetFullPath(dest);
        if (UpdateOnly && (!File.Exists(Path.Combine(dest, ".runtime", "electron.exe")) || !File.Exists(Path.Combine(dest, "package.json")))) throw new InvalidOperationException("Install Matrix with the full Setup first, then run this updater.");
        foreach (var p in Process.GetProcessesByName("electron")) {
            try { if (p.MainModule.FileName.StartsWith(dest + "\\", StringComparison.OrdinalIgnoreCase)) { p.Kill(); p.WaitForExit(5000); } } catch { }
        }
        // Update application files in place. Saved profiles from older releases
        // must remain available for migration on first launch.
        Directory.CreateDirectory(dest);
        using (var zip = ZipFile.OpenRead(self)) {
            foreach (var entry in zip.Entries) {
                if (entry.FullName.EndsWith("/")) continue;
                string target = Path.GetFullPath(Path.Combine(dest, entry.FullName.Replace('/', '\\')));
                if (!target.StartsWith(dest + "\\", StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Bad path " + entry.FullName);
                Directory.CreateDirectory(Path.GetDirectoryName(target));
                entry.ExtractToFile(target, true);
            }
        }
        File.WriteAllText(Path.Combine(dest, "Uninstall.cmd"),
            "@echo off\r\ndel \"%USERPROFILE%\\Desktop\\Matrix.lnk\" 2>nul\r\ndel \"%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Matrix.lnk\" 2>nul\r\ncd /d \"%TEMP%\"\r\nrmdir /s /q \"%LOCALAPPDATA%\\Matrix\"\r\n");
        string exe = Path.Combine(dest, ".runtime", "electron.exe");
        string arguments = "\"" + dest + "\" --release";
        string[] links = {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Matrix.lnk"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Matrix.lnk") };
        Type shellType = Type.GetTypeFromProgID("WScript.Shell");
        object shell = Activator.CreateInstance(shellType);
        foreach (string link in links) {
            if (Array.IndexOf(args, "/noshortcuts") >= 0) continue;
            object s = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { link });
            Type t = s.GetType();
            t.InvokeMember("TargetPath", BindingFlags.SetProperty, null, s, new object[] { exe });
            t.InvokeMember("Arguments", BindingFlags.SetProperty, null, s, new object[] { arguments });
            t.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, s, new object[] { dest });
            t.InvokeMember("IconLocation", BindingFlags.SetProperty, null, s, new object[] { Path.Combine(dest, "resources", "matrix.ico") });
            t.InvokeMember("Save", BindingFlags.InvokeMethod, null, s, null);
        }
        if (!noLaunch) {
            var info = new ProcessStartInfo(exe, arguments) { WorkingDirectory = dest, UseShellExecute = false };
            info.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
            Process.Start(info);
        }
    }
}
