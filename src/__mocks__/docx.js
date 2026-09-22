class Document {
  constructor(props) {
    this.sections = props?.sections || [];
  }
}
class Paragraph {
  constructor(props) {
    this.props = props;
  }
}
class TextRun {
  constructor(props) {
    this.props = props;
  }
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
