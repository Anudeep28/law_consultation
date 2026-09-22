class Document {}
class Paragraph {
  constructor() {}
}
class TextRun {
  constructor() {}
}

const Packer = {
  toBuffer: jest.fn().mockResolvedValue(Buffer.from([])),
};

module.exports = {
  Document,
  Packer,
  Paragraph,
  TextRun,
};
