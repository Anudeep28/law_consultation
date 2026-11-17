import React, { useState } from 'react';
import { legalTemplates, templateCategories } from '../data/templates';
import { LegalTemplate } from '../types';
import { FileText } from 'lucide-react';
import { Modal } from './ui/Modal';

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
    <Modal open onClose={onClose} title="Choose Legal Template" maxWidth="6xl" panelClassName="flex flex-col">
        {/* Search + filter row */}
        <div className="px-6 pb-4 border-b border-line flex-shrink-0 bg-cream">
          <div className="flex gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search templates..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-line-soft rounded-xl bg-cream-raised text-ink placeholder-ink-weakest focus:outline-none focus:border-accent-dark focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 border border-line-soft rounded-xl bg-cream-raised text-ink focus:outline-none focus:border-accent-dark focus:ring-2 focus:ring-accent/30"
            >
              <option value="All">All Categories</option>
              {templateCategories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Body: list + preview */}
        <div className="flex flex-col md:flex-row flex-1 overflow-y-auto md:overflow-hidden">
          {/* Template list */}
          <div className="w-full md:w-80 max-h-[40vh] md:max-h-none flex-shrink-0 border-b md:border-b-0 md:border-r border-line overflow-y-auto bg-cream-raised">
            {filteredTemplates.length === 0 ? (
              <div className="text-center py-12 px-4">
                <p className="text-ink-faint">No templates found matching your criteria.</p>
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {filteredTemplates.map((template) => (
                  <div
                    key={template.id}
                    className={`border rounded-xl p-3 cursor-pointer transition ${
                      previewTemplate?.id === template.id
                        ? 'border-brand bg-brand-soft'
                        : 'border-line hover:border-accent-dark hover:bg-cream'
                    }`}
                    onClick={() => setPreviewTemplate(template)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-semibold text-ink text-sm leading-tight">{template.name}</h3>
                      <span className="text-xs rounded-full bg-warning-bg px-2 py-0.5 font-medium text-warning-ink whitespace-nowrap flex-shrink-0">
                        {template.category}
                      </span>
                    </div>
                    <p className="text-xs text-ink-faint line-clamp-2">{template.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Preview pane */}
          <div className="flex-none md:flex-1 md:overflow-y-auto bg-white">
            {previewTemplate ? (
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-ink">{previewTemplate.name}</h3>
                    <p className="text-sm text-ink-faint mt-1">{previewTemplate.description}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs rounded-full bg-warning-bg px-2 py-1 font-medium text-warning-ink">
                        {previewTemplate.category}
                      </span>
                      <span className="text-xs text-ink-faint">
                        {previewTemplate.fields.length} field{previewTemplate.fields.length !== 1 ? 's' : ''} to fill
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => onSelectTemplate(previewTemplate)}
                    className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark whitespace-nowrap transition"
                  >
                    Use Template →
                  </button>
                </div>
                <div className="border border-line rounded-xl p-4 bg-cream">
                  <p className="text-xs text-ink-faint mb-2 uppercase tracking-wide font-medium">Document Preview</p>
                  <pre className="text-xs text-ink-muted whitespace-pre-wrap font-mono leading-relaxed max-h-96 overflow-y-auto">
                    {previewTemplate.content.substring(0, 1200)}{previewTemplate.content.length > 1200 ? '\n\n...(truncated)' : ''}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-ink-weakest">
                <div className="text-center">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-[#d9c7a8]" />
                  <p className="text-sm">Click a template to preview</p>
                </div>
              </div>
            )}
          </div>
        </div>
    </Modal>
  );
};
