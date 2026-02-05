import type { ExportBundle, ExportArtifact } from '../contracts/ExportBundle';
import type { PptxOptions } from '../contracts/ExportOptions';

import { ZipWriter } from './zipWriter';
import { svgTextToPngBytes } from './svgToPngBytes';

type SlideSize = {
  cx: number; // EMU
  cy: number; // EMU
};

function slideSize(layout: PptxOptions['layout']): SlideSize {
  // 914400 EMU per inch.
  // WIDE = 13.333in × 7.5in => 12192000 × 6858000
  // STANDARD (4:3) = 10in × 7.5in => 9144000 × 6858000
  if (layout === 'standard') {
    return { cx: 9144000, cy: 6858000 };
  }
  return { cx: 12192000, cy: 6858000 };
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function pickImageArtifacts(bundle: ExportBundle): ExportArtifact[] {
  return bundle.artifacts.filter((a) => a.type === 'image');
}

function makeContentTypesXml(imageCount: number, slideCount: number): string {
  const slideOverrides = Array.from({ length: slideCount }, (_, i) =>
    `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
  ).join('');
  const imageDefaults = imageCount > 0 ? `<Default Extension="png" ContentType="image/png"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${imageDefaults}
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  ${slideOverrides}
</Types>`;
}

function makeRelsRoot(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function makeCoreXml(title: string): string {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${xmlEscape(title)}</dc:title>
  <dc:creator>EA Modeller PWA</dc:creator>
  <cp:lastModifiedBy>EA Modeller PWA</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}

function makeAppXml(slideCount: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>EA Modeller PWA</Application>
  <Slides>${slideCount}</Slides>
</Properties>`;
}

function makeThemeXml(): string {
  // Minimal theme; PowerPoint will apply defaults if needed.
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">
  <a:themeElements>
    <a:clrScheme name="Office">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="1F497D"/></a:dk2>
      <a:lt2><a:srgbClr val="EEECE1"/></a:lt2>
      <a:accent1><a:srgbClr val="4F81BD"/></a:accent1>
      <a:accent2><a:srgbClr val="C0504D"/></a:accent2>
      <a:accent3><a:srgbClr val="9BBB59"/></a:accent3>
      <a:accent4><a:srgbClr val="8064A2"/></a:accent4>
      <a:accent5><a:srgbClr val="4BACC6"/></a:accent5>
      <a:accent6><a:srgbClr val="F79646"/></a:accent6>
      <a:hlink><a:srgbClr val="0000FF"/></a:hlink>
      <a:folHlink><a:srgbClr val="800080"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Office">
      <a:majorFont><a:latin typeface="Calibri"/></a:majorFont>
      <a:minorFont><a:latin typeface="Calibri"/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Office">
      <a:fillStyleLst/>
      <a:lnStyleLst/>
      <a:effectStyleLst/>
      <a:bgFillStyleLst/>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>`;
}

function makeSlideMasterXml(size: SlideSize): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="${size.cx}" cy="${size.cy}"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="${size.cx}" cy="${size.cy}"/>
        </a:xfrm>
      </p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:sldLayoutIdLst>
    <p:sldLayoutId id="2147483649" r:id="rId1"/>
  </p:sldLayoutIdLst>
</p:sldMaster>`;
}

function makeSlideMasterRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`;
}

function makeSlideLayoutXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
    </p:spTree>
  </p:cSld>
</p:sldLayout>`;
}

function makeSlideLayoutRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`;
}

function makePresentationXml(slideCount: number, size: SlideSize, layout: PptxOptions['layout']): string {
  const sldIds = Array.from({ length: slideCount }, (_, i) =>
    `<p:sldId id="${256 + i}" r:id="rId${2 + i}"/>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst>
    <p:sldMasterId id="2147483648" r:id="rId1"/>
  </p:sldMasterIdLst>
  <p:sldIdLst>
    ${sldIds}
  </p:sldIdLst>
  <p:sldSz cx="${size.cx}" cy="${size.cy}" type="${layout === 'standard' ? 'screen4x3' : 'screen16x9'}"/>
</p:presentation>`;
}

function makePresentationRels(slideCount: number): string {
  const slideRels = Array.from({ length: slideCount }, (_, i) =>
    `<Relationship Id="rId${2 + i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  ${slideRels}
</Relationships>`;
}

function makeSlideXml(size: SlideSize, title: string, imageRelId: string, opts: { footer?: string }): string {
  const margin = 457200; // 0.5in
  const x = margin;
  const y = margin;
  const cx = size.cx - margin * 2;
  const cy = size.cy - margin * 2;
  const footerText = opts.footer?.trim();
  const footerShape = footerText
    ? `
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Footer"/>
          <p:cNvSpPr txBox="1"/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="${margin}" y="${size.cy - 320000}"/>
            <a:ext cx="${size.cx - margin * 2}" cy="250000"/>
          </a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
          <a:noFill/>
          <a:ln><a:noFill/></a:ln>
        </p:spPr>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p>
            <a:r>
              <a:rPr lang="en-US" sz="1200"/>
              <a:t>${xmlEscape(footerText)}</a:t>
            </a:r>
          </a:p>
        </p:txBody>
      </p:sp>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
      <p:pic>
        <p:nvPicPr>
          <p:cNvPr id="2" name="${xmlEscape(title)}"/>
          <p:cNvPicPr/>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="${imageRelId}"/>
          <a:stretch><a:fillRect/></a:stretch>
        </p:blipFill>
        <p:spPr>
          <a:xfrm>
            <a:off x="${x}" y="${y}"/>
            <a:ext cx="${cx}" cy="${cy}"/>
          </a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
      </p:pic>
      ${footerShape}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

function makeSlideRels(imageTarget: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${imageTarget}"/>
</Relationships>`;
}

async function toPngBytesFromArtifact(a: ExportArtifact): Promise<Uint8Array | null> {
  if (a.type !== 'image') return null;
  if (a.data.kind === 'png') {
    // Expected to be a data URL.
    const m = /^data:image\/png;base64,(.*)$/i.exec(a.data.data.trim());
    if (!m) throw new Error('PNG artifact is not a base64 data URL.');
    const b64 = m[1];
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
    return out;
  }
  if (a.data.kind === 'svg') {
    return svgTextToPngBytes(a.data.data, { scale: 2, background: '#ffffff' });
  }
  return null;
}

/**
 * PPTX v1: image-based slides.
 *
 * - One slide per image artifact.
 * - Uses a dependency-free ZIP writer and minimal OOXML parts.
 */
export async function generatePptxBlobV1(bundle: ExportBundle, options: PptxOptions): Promise<Blob> {
  const images = pickImageArtifacts(bundle);
  if (images.length === 0) {
    throw new Error('No image artifacts available for PPTX export.');
  }

  const size = slideSize(options.layout);
  // v1: show footer only if text is provided.
  const footer = (options.footerText ?? '').trim();

  // Convert images to PNG bytes.
  const pngBytes: { name: string; bytes: Uint8Array }[] = [];
  for (let i = 0; i < images.length; i++) {
    const b = await toPngBytesFromArtifact(images[i]);
    if (!b) continue;
    pngBytes.push({ name: `image${i + 1}.png`, bytes: b });
  }
  if (pngBytes.length === 0) {
    throw new Error('Failed to rasterize image artifacts for PPTX export.');
  }

  const zip = new ZipWriter();

  const slideCount = pngBytes.length;
  zip.addFile('[Content_Types].xml', makeContentTypesXml(pngBytes.length, slideCount));
  zip.addFile('_rels/.rels', makeRelsRoot());

  zip.addFile('docProps/core.xml', makeCoreXml(bundle.title));
  zip.addFile('docProps/app.xml', makeAppXml(slideCount));

  zip.addFile('ppt/theme/theme1.xml', makeThemeXml());
  zip.addFile('ppt/slideMasters/slideMaster1.xml', makeSlideMasterXml(size));
  zip.addFile('ppt/slideMasters/_rels/slideMaster1.xml.rels', makeSlideMasterRels());
  zip.addFile('ppt/slideLayouts/slideLayout1.xml', makeSlideLayoutXml());
  zip.addFile('ppt/slideLayouts/_rels/slideLayout1.xml.rels', makeSlideLayoutRels());

  zip.addFile('ppt/presentation.xml', makePresentationXml(slideCount, size, options.layout));
  zip.addFile('ppt/_rels/presentation.xml.rels', makePresentationRels(slideCount));

  for (let i = 0; i < slideCount; i++) {
    const slideNo = i + 1;
    const imageName = pngBytes[i].name;
    zip.addFile(`ppt/media/${imageName}`, pngBytes[i].bytes);
    zip.addFile(
      `ppt/slides/slide${slideNo}.xml`,
      makeSlideXml(size, images[i].name, 'rId2', { footer })
    );
    zip.addFile(`ppt/slides/_rels/slide${slideNo}.xml.rels`, makeSlideRels(imageName));
  }

  const bytes = zip.build();
  // Ensure BlobPart uses an ArrayBuffer-backed view (avoids SharedArrayBuffer typing issues in TS).
  const safeBytes = new Uint8Array(bytes);
  return new Blob([safeBytes], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}
