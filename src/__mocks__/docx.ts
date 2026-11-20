import { vi } from 'vitest';

export class Document {
  sections: unknown[];
  constructor(props?: { sections?: unknown[] }) {
    this.sections = props?.sections || [];
  }
}
export class Paragraph {
  constructor(public props: unknown) {}
}
export class TextRun {
  constructor(public props: unknown) {}
}

export const Packer = {
  toBlob: vi.fn().mockResolvedValue(new Blob([], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })),
};
