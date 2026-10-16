using System.IO.Compression;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using System.Xml;

namespace KontoKompass.Windows;

internal static class XlsxParser
{
    // Minimal leser for verdier på første ark, ikke makroer/formler eller avansert regnearklayout.
    internal static Dictionary<string, object> Load(string path)
    {
        using var zip = ZipFile.OpenRead(path);
        var sheet = zip.GetEntry("xl/worksheets/sheet1.xml") ?? throw new InvalidDataException("Kan ikke finne første regneark.");
        const long maxUncompressed = 25L * 1024 * 1024;
        if (sheet.Length > maxUncompressed || zip.Entries.Sum(entry => entry.Length) > maxUncompressed * 2)
            throw new InvalidDataException("Excel-filen er for stor etter utpakking.");
        var strings = new List<string>();
        var shared = zip.GetEntry("xl/sharedStrings.xml");
        if (shared != null)
        {
            using var sr = shared.Open();
            var xml = LoadSafeXml(sr);
            XNamespace ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
            foreach(var si in xml.Descendants(ns + "si"))
                strings.Add(string.Concat(si.Descendants(ns + "t").Select(t => t.Value)));
        }
        using var stream = sheet.Open();
        var doc = LoadSafeXml(stream);
        XNamespace x = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        var result = new List<List<string>>();
        var excelRows = doc.Descendants(x + "sheetData").Elements(x + "row").Take(20002);
        foreach (var row in excelRows)
        {
            var cells = new Dictionary<int, string>();
            foreach (var c in row.Elements(x + "c"))
            {
                string reference = c.Attribute("r")?.Value ?? "";
                int col = ColumnIndex(reference); if (col < 0 || col >= 256) continue;
                string raw = c.Element(x + "v")?.Value ?? string.Concat(c.Descendants(x + "is").Descendants(x + "t").Select(t => t.Value));
                string type = c.Attribute("t")?.Value ?? "";
                if (type == "s" && int.TryParse(raw, out int idx) && idx >= 0 && idx < strings.Count) raw = strings[idx];
                cells[col] = raw;
            }
            if (cells.Count == 0) continue;
            int maxIndex = Math.Min(255, cells.Keys.Max());
            result.Add(Enumerable.Range(0, maxIndex + 1).Select(i => cells.TryGetValue(i, out var v) ? v : "").ToList());
        }
        if (result.Count < 2) throw new InvalidDataException("Filen må inneholde kolonneoverskrifter og minst én transaksjonsrad.");
        var head = result[0];
        if (head.Count == 0 || head.All(string.IsNullOrWhiteSpace)) throw new InvalidDataException("Mangler kolonneoverskrifter.");
        return new Dictionary<string, object> { ["headers"] = head, ["rows"] = result.Skip(1).ToArray(), ["warning"] = "Kontroller dato- og beløpsformat. Kun første ark og celleverdier er lest. Formler beregnes ikke." };
    }
    private static XDocument LoadSafeXml(Stream stream)
    {
        var settings = new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = 25L * 1024 * 1024 };
        using var reader = XmlReader.Create(stream, settings);
        return XDocument.Load(reader);
    }
    private static int ColumnIndex(string cell)
    {
        var m=Regex.Match(cell, "^[A-Z]+", RegexOptions.CultureInvariant);
        if (!m.Success) return -1;
        int n=0; foreach(var ch in m.Value) n=n*26+(ch-'A'+1);
        return n-1;
    }
}
