const React = require('react');

function ReactMarkdown({ children, ...props }) {
  return React.createElement('div', { 'data-testid': 'react-markdown', ...props }, children);
}

module.exports = ReactMarkdown;
