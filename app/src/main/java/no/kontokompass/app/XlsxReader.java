package no.kontokompass.app;

import org.json.JSONArray;
import org.json.JSONObject;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/** Minimal offline XLSX reader: first worksheet, numeric and inline/shared-string cells. */
public final class XlsxReader {
    private XlsxReader() {}
    private static final int MAX_XML = 25 * 1024 * 1024;
    private static Document xml(byte[] bytes) throws Exception {
        DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
        f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        f.setFeature("http://xml.org/sax/features/external-general-entities", false);
        f.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        f.setXIncludeAware(false); f.setExpandEntityReferences(false);
        return f.newDocumentBuilder().parse(new ByteArrayInputStream(bytes));
    }
    private static String fullText(Element node, String tag) {
        NodeList nodes = node.getElementsByTagName(tag);
        StringBuilder out = new StringBuilder();
        for (int i=0; i<nodes.getLength(); i++) out.append(nodes.item(i).getTextContent());
        return out.toString();
    }
    private static int columnNumber(String ref) {
        int v=0;
        for(int i=0; i<ref.length(); i++) {
            char c=ref.charAt(i); if(!Character.isLetter(c)) break;
            v=v*26+Character.toUpperCase(c)-'A'+1;
        }
        return v-1;
    }
    public static JSONObject read(byte[] input, String name) throws Exception {
        Map<String,byte[]> files = new HashMap<>();
        int total = 0;
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(input))) {
            ZipEntry entry;
            while ((entry=zip.getNextEntry())!=null) {
                String p=entry.getName();
                if (!(p.equals("xl/sharedStrings.xml") || p.equals("xl/worksheets/sheet1.xml"))) continue;
                ByteArrayOutputStream out=new ByteArrayOutputStream();
                byte[] part=new byte[8192]; int n;
                while ((n=zip.read(part))!=-1) {
                    total+=n; if(total>MAX_XML) throw new IllegalArgumentException("Excel-filen inneholder for mye data");
                    out.write(part,0,n);
                }
                files.put(p,out.toByteArray());
            }
        }
        if (!files.containsKey("xl/worksheets/sheet1.xml"))
            throw new IllegalArgumentException("Fant ikke det første regnearket i XLSX-filen");
        ArrayList<String> shared = new ArrayList<>();
        if (files.containsKey("xl/sharedStrings.xml")) {
            NodeList nodes=xml(files.get("xl/sharedStrings.xml")).getElementsByTagName("si");
            for(int i=0;i<nodes.getLength();i++) shared.add(fullText((Element)nodes.item(i),"t"));
        }
        Document sheet=xml(files.get("xl/worksheets/sheet1.xml"));
        NodeList rowNodes=sheet.getElementsByTagName("row");
        if (rowNodes.getLength()>10000) throw new IllegalArgumentException("For mange rader i XLSX. Del opp kontoutskriften.");
        JSONArray output = new JSONArray();
        for (int ri=0;ri<rowNodes.getLength() && ri<10001;ri++) {
            Element row=(Element)rowNodes.item(ri);
            NodeList cells=row.getElementsByTagName("c");
            Map<Integer,String> values=new HashMap<>(); int max=-1;
            for(int j=0;j<cells.getLength();j++) {
                Element c=(Element)cells.item(j); int col=columnNumber(c.getAttribute("r"));
                if(col<0||col>127)continue;
                String type=c.getAttribute("t"), value;
                if("inlineStr".equals(type)) value=fullText(c,"t");
                else value=fullText(c,"v");
                if("s".equals(type)) { try { value=shared.get(Integer.parseInt(value)); }catch(Exception e){value="";} }
                if("b".equals(type)) value="1".equals(value)?"SANN":"USANN";
                values.put(col,value); max=Math.max(max,col);
            }
            if(max<0) continue;
            JSONArray line=new JSONArray();
            for(int c=0;c<=max;c++) line.put(values.getOrDefault(c,""));
            output.put(line);
        }
        if(output.length()<2) throw new IllegalArgumentException("Excel-filen mangler overskrift eller transaksjonsrader");
        JSONArray headers=output.getJSONArray(0);
        JSONArray rows=new JSONArray();
        for(int i=1;i<output.length();i++) rows.put(output.getJSONArray(i));
        return new JSONObject().put("name",name).put("headers",headers).put("rows",rows).put("warning","Excel-datoer kan være serienumre. Kontroller datoer før import.");
    }
}
