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
  toBlob: jest.fn().mockResolvedValue(new Blob([], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })),
};

module.exports = {
  Document,
  Packer,
  Paragraph,
  TextRun,
};
