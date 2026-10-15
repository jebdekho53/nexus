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
    // Downloads may receive an executable wrapper/prefix. ZIP offsets then
    // refer to the original payload position, not the physical file position.
    // Locate the actual central directory and give .NET a relative view.
    static ZipArchive OpenPayload(string file) {
        var input = File.OpenRead(file);
        try {
            int tailLength = (int)Math.Min(input.Length, 131072);
            byte[] tail = new byte[tailLength];
            input.Position = input.Length - tailLength;
            int read = 0;
            while (read < tail.Length) { int n = input.Read(tail, read, tail.Length - read); if (n == 0) throw new EndOfStreamException(); read += n; }
            for (int i = tail.Length - 22; i >= 0; i--) {
                if (BitConverter.ToUInt32(tail, i) != 0x06054b50) continue;
                int comment = BitConverter.ToUInt16(tail, i + 20);
                if (i + 22 + comment > tail.Length) continue;
                ushort disk = BitConverter.ToUInt16(tail, i + 4), cdDisk = BitConverter.ToUInt16(tail, i + 6);
                ushort onDisk = BitConverter.ToUInt16(tail, i + 8), total = BitConverter.ToUInt16(tail, i + 10);
                uint size = BitConverter.ToUInt32(tail, i + 12), offset = BitConverter.ToUInt32(tail, i + 16);
                if (disk != 0 || cdDisk != 0 || onDisk != total || total == 0 || total == 65535 || size == uint.MaxValue || offset == uint.MaxValue) continue;
                long end = input.Length - tailLength + i;
                long central = end - size, start = central - offset;
                if (central < 0 || start < 0 || central + 4 > input.Length) continue;
                input.Position = central;
                byte[] signature = new byte[4];
                if (input.Read(signature, 0, 4) != 4 || BitConverter.ToUInt32(signature, 0) != 0x02014b50) continue;
                var zip = new ZipArchive(new PayloadStream(input, start, end + 22 + comment - start), ZipArchiveMode.Read);
                if (zip.Entries.Count != total) { zip.Dispose(); throw new InvalidDataException("Installer payload entry count mismatch"); }
                return zip;
            }
            throw new InvalidDataException("Installer payload is missing or incomplete. Download the updater again.");
        } catch { input.Dispose(); throw; }
    }
    sealed class PayloadStream : Stream {
        readonly Stream input; readonly long start, length; long position;
        public PayloadStream(Stream input, long start, long length) { this.input = input; this.start = start; this.length = length; }
        public override bool CanRead { get { return true; } }
        public override bool CanSeek { get { return true; } }
        public override bool CanWrite { get { return false; } }
        public override long Length { get { return length; } }
        public override long Position { get { return position; } set { Seek(value, SeekOrigin.Begin); } }
        public override int Read(byte[] buffer, int offset, int count) { input.Position = start + position; int n = input.Read(buffer, offset, (int)Math.Min(count, length - position)); position += n; return n; }
        public override long Seek(long offset, SeekOrigin origin) { long next = origin == SeekOrigin.Begin ? offset : origin == SeekOrigin.Current ? position + offset : length + offset; if (next < 0 || next > length) throw new IOException("Payload seek outside archive"); position = next; return next; }
        public override void Flush() { }
        public override void SetLength(long value) { throw new NotSupportedException(); }
        public override void Write(byte[] buffer, int offset, int count) { throw new NotSupportedException(); }
        protected override void Dispose(bool disposing) { if (disposing) input.Dispose(); base.Dispose(disposing); }
    }
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
        bool verifyOnly = Array.IndexOf(args, "/verify") >= 0;
        string payloadFile = self;
        if (verifyOnly) foreach (string arg in args) if (arg.StartsWith("/archive=", StringComparison.OrdinalIgnoreCase)) payloadFile = Path.GetFullPath(arg.Substring(9));
        string dest = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Matrix");
        foreach (string arg in args) if (arg.StartsWith("/target=", StringComparison.OrdinalIgnoreCase)) dest = Path.GetFullPath(arg.Substring(8));
        dest = Path.GetFullPath(dest);
        if (!verifyOnly && UpdateOnly && (!File.Exists(Path.Combine(dest, ".runtime", "electron.exe")) || !File.Exists(Path.Combine(dest, "package.json")))) throw new InvalidOperationException("Install Matrix with the full Setup first, then run this updater.");
        using (var zip = OpenPayload(payloadFile)) {
        // Validate the directory and all destination paths before stopping apps.
        foreach (var entry in zip.Entries) {
            string target = Path.GetFullPath(Path.Combine(dest, entry.FullName.Replace('/', '\\')));
            if (!target.StartsWith(dest + "\\", StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Bad path " + entry.FullName);
        }
        if (verifyOnly) {
            foreach (var entry in zip.Entries) using (var stream = entry.Open()) stream.CopyTo(Stream.Null);
            return;
        }
        foreach (var p in Process.GetProcessesByName("electron")) {
            try { if (p.MainModule.FileName.StartsWith(dest + "\\", StringComparison.OrdinalIgnoreCase)) { p.Kill(); p.WaitForExit(5000); } } catch { }
        }
        // Update application files in place. Saved profiles from older releases
        // must remain available for migration on first launch.
        Directory.CreateDirectory(dest);
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
