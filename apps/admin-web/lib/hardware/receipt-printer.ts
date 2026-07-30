/**
 * TSPL Receipt Printer - Thermal Receipt Generation
 * Generates TSPL commands for Zebra thermal printers
 */

export interface ReceiptData {
  title: string;
  orderNumber: string;
  date: Date;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: string;
  deviceSerial?: string;
  deviceImei?: string;
  warrantyInfo?: {
    warrantyNumber: string;
    expiryDate: Date;
    coverage: string;
  };
  storeName?: string;
  storeAddress?: string;
  notes?: string;
}

export class ReceiptPrinter {
  private paperWidth: number = 80; // mm
  private dpi: number = 203; // dots per inch

  constructor(paperWidth: number = 80, dpi: number = 203) {
    this.paperWidth = paperWidth;
    this.dpi = dpi;
  }

  /**
   * Generate TSPL receipt commands
   */
  generateReceiptTSPL(data: ReceiptData): string {
    const commands: string[] = [];
    const pixelWidth = this.mmToPixels(this.paperWidth);
    let yPosition = 50;

    // Initialize printer
    commands.push('CLS');
    commands.push(`SIZE ${this.paperWidth}mm,150mm`);
    commands.push('DIRECTION 0');
    commands.push('SET PEEL OFF');
    commands.push('SET TEAR ON');

    // Store header
    if (data.storeName) {
      commands.push(this.text(
        pixelWidth / 2,
        yPosition,
        'A',
        data.storeName,
        'center',
        'bold'
      ));
      yPosition += 30;
    }

    // Title
    commands.push(this.text(pixelWidth / 2, yPosition, 'A', data.title, 'center', 'bold'));
    yPosition += 30;

    // Order details
    commands.push(this.text(50, yPosition, 'A', `Order: ${data.orderNumber}`));
    yPosition += 20;

    commands.push(this.text(
      50,
      yPosition,
      'A',
      `Date: ${this.formatDate(data.date)}`
    ));
    yPosition += 20;

    // Separator
    commands.push(`LINE 50,${yPosition},${pixelWidth - 50},${yPosition},1`);
    yPosition += 20;

    // Item headers
    commands.push(this.text(50, yPosition, 'A', 'Description'));
    commands.push(this.text(pixelWidth - 150, yPosition, 'A', 'Qty'));
    commands.push(this.text(pixelWidth - 100, yPosition, 'A', 'Price'));
    commands.push(this.text(pixelWidth - 50, yPosition, 'A', 'Total', 'right'));
    yPosition += 25;

    // Separator
    commands.push(`LINE 50,${yPosition},${pixelWidth - 50},${yPosition},1`);
    yPosition += 20;

    // Items
    for (const item of data.items) {
      commands.push(this.text(50, yPosition, 'A', item.description.substring(0, 30)));
      commands.push(this.text(pixelWidth - 150, yPosition, 'A', item.quantity.toString()));
      commands.push(this.text(pixelWidth - 100, yPosition, 'A', `$${item.unitPrice.toFixed(2)}`));
      commands.push(this.text(
        pixelWidth - 50,
        yPosition,
        'A',
        `$${item.total.toFixed(2)}`,
        'right'
      ));
      yPosition += 20;
    }

    // Separator
    commands.push(`LINE 50,${yPosition},${pixelWidth - 50},${yPosition},1`);
    yPosition += 20;

    // Totals
    commands.push(this.text(pixelWidth - 150, yPosition, 'A', 'Subtotal:'));
    commands.push(this.text(pixelWidth - 50, yPosition, 'A', `$${data.subtotal.toFixed(2)}`, 'right'));
    yPosition += 20;

    commands.push(this.text(pixelWidth - 150, yPosition, 'A', 'Tax:'));
    commands.push(this.text(pixelWidth - 50, yPosition, 'A', `$${data.tax.toFixed(2)}`, 'right'));
    yPosition += 20;

    // Final total (bold)
    commands.push(`TEXT ${pixelWidth - 150},${yPosition},"A",0,2,2,"Total:"`);
    commands.push(`TEXT ${pixelWidth - 50},${yPosition},"A",0,2,2,"$${data.total.toFixed(2)}"`);
    yPosition += 40;

    // Payment method
    commands.push(this.text(50, yPosition, 'A', `Payment: ${data.paymentMethod}`));
    yPosition += 25;

    // Device & warranty info
    if (data.deviceSerial || data.deviceImei) {
      commands.push(`LINE 50,${yPosition},${pixelWidth - 50},${yPosition},1`);
      yPosition += 15;

      if (data.deviceSerial) {
        commands.push(this.text(50, yPosition, 'A', `Serial: ${data.deviceSerial}`, 'left', 'mono'));
        yPosition += 20;
      }

      if (data.deviceImei) {
        commands.push(this.text(50, yPosition, 'A', `IMEI: ${data.deviceImei}`, 'left', 'mono'));
        yPosition += 20;
      }
    }

    // Warranty info with barcode
    if (data.warrantyInfo) {
      commands.push(`LINE 50,${yPosition},${pixelWidth - 50},${yPosition},1`);
      yPosition += 15;

      commands.push(this.text(50, yPosition, 'A', 'WARRANTY', 'center', 'bold'));
      yPosition += 20;

      commands.push(this.text(50, yPosition, 'A', `Number: ${data.warrantyInfo.warrantyNumber}`, 'left', 'mono', 'small'));
      yPosition += 15;

      commands.push(this.text(
        50,
        yPosition,
        'A',
        `Expires: ${this.formatDate(data.warrantyInfo.expiryDate)}`,
        'left',
        'mono',
        'small'
      ));
      yPosition += 15;

      commands.push(this.text(
        50,
        yPosition,
        'A',
        `Coverage: ${data.warrantyInfo.coverage}`,
        'left',
        'mono',
        'small'
      ));
      yPosition += 20;

      // Warranty barcode
      commands.push(
        `BARCODE ${pixelWidth / 2},${yPosition},"CODE128",60,1,0,2,"${data.warrantyInfo.warrantyNumber}"`
      );
      yPosition += 60;
    }

    // Footer notes
    if (data.notes) {
      commands.push(`LINE 50,${yPosition},${pixelWidth - 50},${yPosition},1`);
      yPosition += 15;

      commands.push(this.text(pixelWidth / 2, yPosition, 'A', data.notes, 'center', 'small'));
      yPosition += 25;
    }

    // Thank you message
    commands.push(this.text(pixelWidth / 2, yPosition, 'A', 'Thank you!', 'center'));
    yPosition += 25;

    // Print command
    commands.push('PRINT 1');

    return commands.join('\n') + '\n';
  }

  /**
   * Generate shipping label TSPL commands
   */
  generateShippingLabelTSPL(data: {
    serialNumber: string;
    deviceModel: string;
    deviceColor?: string;
    trackingNumber?: string;
    shippingAddress?: string;
    warrantyInfo?: {
      warrantyNumber: string;
      expiryDate: Date;
    };
  }): string {
    const commands: string[] = [];
    const labelWidth = 102; // 4 inches
    const labelHeight = 152; // 6 inches
    const pixelWidth = this.mmToPixels(labelWidth);
    let yPosition = 50;

    commands.push('CLS');
    commands.push(`SIZE ${labelWidth}mm,${labelHeight}mm`);
    commands.push('DIRECTION 0');

    // Title
    commands.push(`TEXT ${pixelWidth / 2},${yPosition},"A",0,2,2,"SHIPPING LABEL"`);
    yPosition += 40;

    // Serial number (large)
    commands.push(this.text(50, yPosition, 'A', 'Serial Number:', 'left', 'mono', 'small'));
    yPosition += 15;
    commands.push(`TEXT 50,${yPosition},"A",0,2,2,"${data.serialNumber}"`);
    yPosition += 35;

    // Serial barcode
    commands.push(`BARCODE 50,${yPosition},"CODE128",60,1,0,2,"${data.serialNumber}"`);
    yPosition += 60;

    // Device info
    commands.push(this.text(50, yPosition, 'A', `Model: ${data.deviceModel}`, 'left', 'mono', 'small'));
    yPosition += 15;

    if (data.deviceColor) {
      commands.push(this.text(50, yPosition, 'A', `Color: ${data.deviceColor}`, 'left', 'mono', 'small'));
      yPosition += 15;
    }

    // Tracking number
    if (data.trackingNumber) {
      yPosition += 10;
      commands.push(this.text(50, yPosition, 'A', 'Tracking:', 'left', 'mono', 'small'));
      yPosition += 15;
      commands.push(this.text(50, yPosition, 'A', data.trackingNumber, 'left', 'mono', 'small'));
      yPosition += 15;

      // Tracking barcode
      commands.push(`BARCODE 50,${yPosition},"CODE128",50,1,0,2,"${data.trackingNumber}"`);
      yPosition += 50;
    }

    // Warranty QR code
    if (data.warrantyInfo) {
      const warrantyUrl = `https://warranty.example.com/${data.warrantyInfo.warrantyNumber}`;
      commands.push(`QRCODE ${pixelWidth / 2},${yPosition},L,5,"${warrantyUrl}"`);
      yPosition += 80;

      commands.push(this.text(
        50,
        yPosition,
        'A',
        `Warranty: ${data.warrantyInfo.warrantyNumber}`,
        'left',
        'mono',
        'small'
      ));
    }

    commands.push('PRINT 1');

    return commands.join('\n') + '\n';
  }

  /**
   * Helper: Generate text command
   */
  private text(
    x: number,
    y: number,
    font: string,
    text: string,
    alignment: 'left' | 'center' | 'right' = 'left',
    style: 'normal' | 'bold' | 'mono' = 'normal',
    size: 'small' | 'normal' | 'large' = 'normal'
  ): string {
    let xPos = x;

    // Adjust for alignment (approximate pixel widths)
    if (alignment === 'center') {
      const charWidth = size === 'small' ? 6 : 8;
      xPos = x - (text.length * charWidth) / 2;
    } else if (alignment === 'right') {
      const charWidth = size === 'small' ? 6 : 8;
      xPos = x - text.length * charWidth;
    }

    const fontSizeMultiplier = size === 'small' ? 1 : size === 'large' ? 2 : 1;

    return `TEXT ${xPos},${y},"${font}",0,${fontSizeMultiplier},${fontSizeMultiplier},"${text}"`;
  }

  /**
   * Helper: Convert mm to pixels
   */
  private mmToPixels(mm: number): number {
    return Math.round((mm / 25.4) * this.dpi);
  }

  /**
   * Helper: Format date
   */
  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }
}
