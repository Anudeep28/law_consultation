import React, { useState } from 'react';
import { legalTemplates, templateCategories } from '../data/templates';
import { LegalTemplate } from '../types';
import { FileText } from 'lucide-react';

interface TemplateSelectorProps {
  onSelectTemplate: (template: LegalTemplate) => void;
  onClose: () => void;
}

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  onSelectTemplate,
  onClose,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [previewTemplate, setPreviewTemplate] = useState<LegalTemplate | null>(null);

  const filteredTemplates = legalTemplates.filter((template) => {
    const matchesCategory = selectedCategory === 'All' || template.category === selectedCategory;
    const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         template.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl border border-[#eadbc1] w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-[#eadbc1] flex-shrink-0 bg-[#fffaf0]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-[#32151b]">Choose Legal Template</h2>
            <button onClick={onClose} className="text-[#8c6b54] hover:text-[#6f5a49]">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search templates..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-[#e6d8c2] rounded-xl bg-[#fffcf6] text-[#32151b] placeholder-[#a89580] focus:outline-none focus:border-[#b8862d] focus:ring-2 focus:ring-[#f4c95d]/30"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 border border-[#e6d8c2] rounded-xl bg-[#fffcf6] text-[#32151b] focus:outline-none focus:border-[#b8862d] focus:ring-2 focus:ring-[#f4c95d]/30"
            >
              <option value="All">All Categories</option>
              {templateCategories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Body: list + preview */}
        <div className="flex flex-1 overflow-hidden">
          {/* Template list */}
          <div className="w-80 flex-shrink-0 border-r border-[#eadbc1] overflow-y-auto bg-[#fffcf6]">
            {filteredTemplates.length === 0 ? (
              <div className="text-center py-12 px-4">
                <p className="text-[#8c6b54]">No templates found matching your criteria.</p>
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {filteredTemplates.map((template) => (
                  <div
                    key={template.id}
                    className={`border rounded-xl p-3 cursor-pointer transition ${
                      previewTemplate?.id === template.id
                        ? 'border-[#701f2f] bg-[#fff1f3]'
                        : 'border-[#eadbc1] hover:border-[#b8862d] hover:bg-[#fffaf0]'
                    }`}
                    onClick={() => setPreviewTemplate(template)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-semibold text-[#32151b] text-sm leading-tight">{template.name}</h3>
                      <span className="text-xs rounded-full bg-[#fff4d6] px-2 py-0.5 font-medium text-[#765116] whitespace-nowrap flex-shrink-0">
                        {template.category}
                      </span>
                    </div>
                    <p className="text-xs text-[#8c6b54] line-clamp-2">{template.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Preview pane */}
          <div className="flex-1 overflow-y-auto bg-white">
            {previewTemplate ? (
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-[#32151b]">{previewTemplate.name}</h3>
                    <p className="text-sm text-[#8c6b54] mt-1">{previewTemplate.description}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs rounded-full bg-[#fff4d6] px-2 py-1 font-medium text-[#765116]">
                        {previewTemplate.category}
                      </span>
                      <span className="text-xs text-[#8c6b54]">
                        {previewTemplate.fields.length} field{previewTemplate.fields.length !== 1 ? 's' : ''} to fill
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => onSelectTemplate(previewTemplate)}
                    className="px-4 py-2 bg-[#701f2f] text-white text-sm font-medium rounded-lg hover:bg-[#541522] whitespace-nowrap transition"
                  >
                    Use Template →
                  </button>
                </div>
                <div className="border border-[#eadbc1] rounded-xl p-4 bg-[#fffaf0]">
                  <p className="text-xs text-[#8c6b54] mb-2 uppercase tracking-wide font-medium">Document Preview</p>
                  <pre className="text-xs text-[#6f5a49] whitespace-pre-wrap font-mono leading-relaxed max-h-96 overflow-y-auto">
                    {previewTemplate.content.substring(0, 1200)}{previewTemplate.content.length > 1200 ? '\n\n...(truncated)' : ''}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-[#a89580]">
                <div className="text-center">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-[#d9c7a8]" />
                  <p className="text-sm">Click a template to preview</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
