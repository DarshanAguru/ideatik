import RNFS from 'react-native-fs';
import { Share } from 'react-native';
import { jsPDF } from 'jspdf';
import { Buffer } from 'buffer';
import { StructuredNoteService } from '../notes/StructuredNoteService';

export interface ExportedFile {
  filePath: string;
  fileName: string;
}

class ExportServiceClass {
  private getExportDirectory(): string {
    return `${RNFS.CachesDirectoryPath}/exports`;
  }

  private async ensureExportDirectoryExists(): Promise<string> {
    const dir = this.getExportDirectory();
    const exists = await RNFS.exists(dir);
    if (!exists) {
      await RNFS.mkdir(dir);
    }
    return dir;
  }

  private sanitizeFileName(title: string): string {
    return title.trim().replace(/[/\\?%*:|"<>\s]+/g, '_');
  }

  /**
   * Exports a note/list as a plain text (.txt) file.
   */
  async exportToTxt(note: any): Promise<ExportedFile> {
    const dir = await this.ensureExportDirectoryExists();
    const sanitizedTitle = this.sanitizeFileName(note.title);
    const filePath = `${dir}/${sanitizedTitle}.txt`;

    let content = `TITLE: ${note.title}\n`;
    content += `CREATED: ${new Date(note.createdAt).toLocaleString()}\n`;
    content += `TYPE: ${note.type.toUpperCase()}\n`;
    content += `========================================\n\n`;

    const structured = StructuredNoteService.fromNote(note);
    const items = StructuredNoteService.items(structured);

    if (note.type === 'list' || note.type === 'finance') {
      let totalAmount = 0;
      let checkedAmount = 0;
      let totalItems = 0;
      let checkedItems = 0;
      let hasAmounts = false;

      content += `ITEMS:\n`;
      for (const item of items) {
        totalItems++;
        const checkMark = item.checked ? '[x]' : '[ ]';
        let itemText = item.text;
        
        if (item.amount !== undefined) {
          hasAmounts = true;
          totalAmount += item.amount;
          if (item.checked) {
            checkedAmount += item.amount;
          }
          itemText += ` (${item.amount >= 0 ? '+' : ''}${item.amount})`;
        }

        if (item.checked) {
          checkedItems++;
        }

        content += `${checkMark} ${itemText}\n`;
      }

      content += `\n========================================\n`;
      content += `SUMMARY:\n`;
      content += `Total Items: ${totalItems}\n`;
      content += `Completed Items: ${checkedItems}/${totalItems}\n`;
      if (hasAmounts) {
        content += `Total Amount: ${totalAmount}\n`;
        content += `Completed Amount: ${checkedAmount}\n`;
      }
    } else {
      content += StructuredNoteService.bodyText(structured);
    }

    if (structured.referenceIds.length > 0) {
      content += `\n\n========================================\n`;
      content += `REFERENCES:\n`;
      for (const ref of structured.referenceIds) {
        content += `- ${ref.title}\n`;
      }
    }

    await RNFS.writeFile(filePath, content, 'utf8');
    return { filePath, fileName: `${sanitizedTitle}.txt` };
  }

  /**
   * Exports a note/list as a markdown (.md) file.
   */
  async exportToMd(note: any): Promise<ExportedFile> {
    const dir = await this.ensureExportDirectoryExists();
    const sanitizedTitle = this.sanitizeFileName(note.title);
    const filePath = `${dir}/${sanitizedTitle}.md`;

    let content = StructuredNoteService.toMarkdown(StructuredNoteService.fromNote(note));
    await RNFS.writeFile(filePath, content, 'utf8');
    return { filePath, fileName: `${sanitizedTitle}.md` };
  }

  /**
   * Exports a note/list as a PDF (.pdf) file.
   */
  async exportToPdf(note: any): Promise<ExportedFile> {
    const dir = await this.ensureExportDirectoryExists();
    const sanitizedTitle = this.sanitizeFileName(note.title);
    const filePath = `${dir}/${sanitizedTitle}.pdf`;

    // Standard A4 dimensions in pt: width = 595.28, height = 841.89
    // Margins: left = 40, top = 50, right = 40
    const doc = new jsPDF({
      orientation: 'p',
      unit: 'pt',
      format: 'a4',
    });

    doc.setFont('Helvetica', 'normal');
    
    // Title
    doc.setFontSize(22);
    doc.text(note.title, 40, 60);

    // Metadata
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    const metaText = `Type: ${note.type.toUpperCase()}   |   Created: ${new Date(note.createdAt).toLocaleString()}`;
    doc.text(metaText, 40, 80);

    // Divider Line
    doc.setLineWidth(0.5);
    doc.setDrawColor(200, 200, 200);
    doc.line(40, 90, 555, 90);

    // Render contents based on type
    doc.setTextColor(0, 0, 0);
    const structured = StructuredNoteService.fromNote(note);
    const items = StructuredNoteService.items(structured);
    if (note.type === 'list' || note.type === 'finance') {
      let y = 120;
      let totalAmount = 0;
      let checkedAmount = 0;
      let totalItems = 0;
      let checkedItems = 0;
      let hasAmounts = false;

      // Header for items
      doc.setFontSize(12);
      doc.setFont('Helvetica', 'bold');
      doc.text('Checklist Items:', 40, 110);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);

      for (const item of items) {
        if (y > 780) {
          doc.addPage();
          y = 50;
        }

        totalItems++;
        
        // Draw checkbox box
        doc.setLineWidth(1);
        doc.setDrawColor(0, 0, 0);
        doc.rect(40, y - 8, 10, 10);

        if (item.checked) {
          checkedItems++;
          // Draw a small checkmark slash
          doc.line(40, y - 3, 44, y + 2);
          doc.line(44, y + 2, 50, y - 8);
        }

        let itemText = item.text;
        if (item.amount !== undefined) {
          hasAmounts = true;
          totalAmount += item.amount;
          if (item.checked) {
            checkedAmount += item.amount;
          }
          itemText += ` (${item.amount >= 0 ? '+' : ''}${item.amount})`;
        }

        // Draw item label
        doc.text(itemText, 60, y);
        y += 20;
      }

      // Draw aggregates footer
      y += 10;
      if (y > 780) {
        doc.addPage();
        y = 50;
      }
      doc.setLineWidth(0.5);
      doc.setDrawColor(200, 200, 200);
      doc.line(40, y - 5, 555, y - 5);

      doc.setFontSize(11);
      doc.setFont('Helvetica', 'bold');
      doc.text('Summary:', 40, y + 15);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);

      doc.text(`Total Items: ${totalItems}`, 40, y + 35);
      doc.text(`Completed Items: ${checkedItems} of ${totalItems}`, 40, y + 50);
      if (hasAmounts) {
        doc.text(`Total Amount: ${totalAmount}`, 300, y + 35);
        doc.text(`Completed Amount: ${checkedAmount}`, 300, y + 50);
      }
    } else {
      // Wrapped text for notes
      const lines = doc.splitTextToSize(StructuredNoteService.bodyText(structured), 515);
      let y = 120;
      doc.setFontSize(10);
      for (const line of lines) {
        if (y > 780) {
          doc.addPage();
          y = 50;
        }
        doc.text(line, 40, y);
        y += 18;
      }
    }

    // References Section
    if (structured.referenceIds.length > 0) {
      let y = doc.internal.pageSize.getHeight() - 100;
      // If footer section overlaps, draw on next page
      if (y < 200) {
        doc.addPage();
        y = 700;
      }
      doc.setLineWidth(0.5);
      doc.setDrawColor(200, 200, 200);
      doc.line(40, y, 555, y);

      doc.setFontSize(10);
      doc.setFont('Helvetica', 'bold');
      doc.text('References:', 40, y + 15);
      doc.setFont('Helvetica', 'normal');
      
      let refY = y + 30;
      for (const ref of structured.referenceIds) {
        doc.text(`- ${ref.title}`, 40, refY);
        refY += 15;
      }
    }

    const pdfOutput = doc.output('arraybuffer');
    const base64 = Buffer.from(pdfOutput).toString('base64');

    await RNFS.writeFile(filePath, base64, 'base64');
    return { filePath, fileName: `${sanitizedTitle}.pdf` };
  }

  /**
   * Exports the note audio memo.
   */
  async exportAudio(note: any, targetFormat: 'm4a' | 'wav'): Promise<ExportedFile> {
    if (!note.audioUri) {
      throw new Error('This note does not contain a voice recording.');
    }

    const dir = await this.ensureExportDirectoryExists();
    const sanitizedTitle = this.sanitizeFileName(note.title);
    const filePath = `${dir}/${sanitizedTitle}.${targetFormat}`;

    // Verify source file exists
    const srcExists = await RNFS.exists(note.audioUri);
    if (!srcExists) {
      throw new Error(`Source audio file could not be found at: ${note.audioUri}`);
    }

    // Copy to exports cache directory
    await RNFS.copyFile(note.audioUri, filePath);
    return { filePath, fileName: `${sanitizedTitle}.${targetFormat}` };
  }

  /**
   * Triggers the Android Native Share Sheet for a generated file.
   */
  async shareFile(file: ExportedFile): Promise<void> {
    const shareUrl = `file://${file.filePath}`;
    await Share.share({
      title: `Export: ${file.fileName}`,
      url: shareUrl,
      message: `Exporting note: ${file.fileName}`,
    });
  }
}

export const ExportService = new ExportServiceClass();
