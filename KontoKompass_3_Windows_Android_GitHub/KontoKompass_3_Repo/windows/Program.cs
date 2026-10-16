using System.Text;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace KontoKompass.Windows;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm());
    }
}

internal sealed class MainForm : Form
{
    private const int MaxFileBytes = 12 * 1024 * 1024;
    private readonly WebView2 web = new() { Dock = DockStyle.Fill };

    internal MainForm()
    {
        Text = "KontoKompass – lokal økonomioversikt";
        Width = 1360; Height = 850;
        MinimumSize = new System.Drawing.Size(850, 580);
        StartPosition = FormStartPosition.CenterScreen;
        Controls.Add(web);
        Load += async (_, _) => await InitializeBrowser();
    }
    private async Task InitializeBrowser()
    {
        try
        {
            string dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KontoKompass", "WebView2");
            Directory.CreateDirectory(dataDir);
            var env = await CoreWebView2Environment.CreateAsync(userDataFolder: dataDir);
            await web.EnsureCoreWebView2Async(env);
            string assetDir = Path.Combine(AppContext.BaseDirectory, "assets");
            if (!File.Exists(Path.Combine(assetDir, "index.html"))) throw new FileNotFoundException("Appens delte grensesnitt mangler: assets/index.html");
            web.CoreWebView2.SetVirtualHostNameToFolderMapping("kontokompass.local", assetDir, CoreWebView2HostResourceAccessKind.DenyCors);
            web.CoreWebView2.NavigationStarting += (_, e) =>
            {
                if (!e.Uri.StartsWith("https://kontokompass.local/", StringComparison.OrdinalIgnoreCase)) e.Cancel = true;
            };
            web.CoreWebView2.WebMessageReceived += (_, e) =>
            {
                try
                {
                    using var json = JsonDocument.Parse(e.WebMessageAsJson);
                    var msg = json.RootElement;
                    string action = msg.GetProperty("action").GetString() ?? "";
                    if (action == "chooseFile") ChooseFile();
                    else if (action == "saveBackup" && msg.TryGetProperty("text", out var body)) SaveBackup(body.GetString() ?? "");
                    else if (action == "saveText") SaveText(msg.GetProperty("name").GetString() ?? "KontoKompass-rapport.csv", msg.GetProperty("text").GetString() ?? "");
                }
                catch (Exception ex) { ShowError("Filoperasjon feilet: " + ex.Message); }
            };
            web.CoreWebView2.Navigate("https://kontokompass.local/index.html");
        }
        catch (Exception ex)
        {
            MessageBox.Show("KontoKompass kunne ikke startes. WebView2 Runtime må være installert.\n\n" + ex.Message,
                "KontoKompass", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
    private async void ChooseFile()
    {
        using var dlg = new OpenFileDialog
        {
            Title = "Velg kontoutskrift eller sikkerhetskopi",
            Filter = "Kontoutskrifter / Backup|*.csv;*.tsv;*.txt;*.xlsx;*.json|Alle filer|*.*",
            CheckFileExists = true
        };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;
        try
        {
            var info = new FileInfo(dlg.FileName);
            if (info.Length > MaxFileBytes) throw new InvalidOperationException("Maksimalt 12 MB per fil.");
            string ext = info.Extension.ToLowerInvariant(), name = info.Name;
            if (ext is ".csv" or ".tsv" or ".txt")
            {
                var bytes = await File.ReadAllBytesAsync(info.FullName);
                string content;
                try { content = new UTF8Encoding(false, true).GetString(bytes); }
                catch (DecoderFallbackException) { content = Encoding.Latin1.GetString(bytes); }
                await InvokeJs("window.importText(" + JsonSerializer.Serialize(name) + "," + JsonSerializer.Serialize(content.TrimStart('\uFEFF')) + ")");
            }
            else if (ext == ".xlsx")
            {
                var table = XlsxParser.Load(info.FullName);
                table["name"] = name;
                await InvokeJs("window.importTable(" + JsonSerializer.Serialize(table) + ")");
            }
            else if (ext == ".json")
            {
                var text = await File.ReadAllTextAsync(info.FullName);
                await InvokeJs("window.restoreBackup(" + JsonSerializer.Serialize(text) + ")");
            }
            else throw new InvalidOperationException("Dette filformatet støttes ikke. Bruk CSV, TSV, XLSX eller JSON.");
        }
        catch (Exception e) { ShowError("Kunne ikke lese fil: " + e.Message); }
    }
    private void SaveBackup(string content)
    {
        if (Encoding.UTF8.GetByteCount(content) > MaxFileBytes) { ShowError("Sikkerhetskopi overstiger 12 MB."); return; }
        using var dlg = new SaveFileDialog
        {
            Title = "Lagre ukryptert JSON-sikkerhetskopi",
            FileName = "KontoKompass-backup.json",
            Filter = "JSON (*.json)|*.json",
            OverwritePrompt = true
        };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;
        try { File.WriteAllText(dlg.FileName, content, new UTF8Encoding(false)); _ = InvokeJs("window.onBackupSaved()"); }
        catch (Exception e) { ShowError("Kunne ikke lagre sikkerhetskopi: " + e.Message); }
    }
    private void SaveText(string filename, string content)
    {
        if (Encoding.UTF8.GetByteCount(content) > MaxFileBytes) { ShowError("Rapport overstiger 12 MB."); return; }
        using var dlg = new SaveFileDialog
        {
            Title = "Lagre transaksjonsrapport lokalt",
            FileName = Path.GetFileName(filename),
            Filter = "CSV (*.csv)|*.csv|Tekst (*.txt)|*.txt",
            OverwritePrompt = true
        };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;
        try { File.WriteAllText(dlg.FileName, content, new UTF8Encoding(false)); _ = InvokeJs("window.onBackupSaved()"); }
        catch (Exception e) { ShowError("Eksport feilet: " + e.Message); }
    }
    private Task InvokeJs(string expression) => web.CoreWebView2 == null ? Task.CompletedTask : web.CoreWebView2.ExecuteScriptAsync(expression);
    private void ShowError(string msg)
    {
        if (web.CoreWebView2 == null) MessageBox.Show(msg, "KontoKompass");
        else _ = InvokeJs("window.showError(" + JsonSerializer.Serialize(msg) + ")");
    }
}
