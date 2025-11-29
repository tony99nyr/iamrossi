'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { css } from '@styled-system/css';

interface MarkdownRendererProps {
  content: string;
}

const containerStyles = css({
  maxWidth: '900px',
  margin: '0 auto',
  padding: '40px 20px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  backgroundColor: '#0a0a0a',
  color: '#ededed',
  minHeight: '100vh',
});

const cardStyles = css({
  backgroundColor: '#1a1a1a',
  border: '1px solid #333',
  borderRadius: '12px',
  padding: '32px',
});

const markdownStyles = css({
  fontSize: '15px',
  lineHeight: '1.7',
  
  '& h1': {
    fontSize: '2em',
    fontWeight: 700,
    marginTop: 0,
    marginBottom: '0.5em',
    borderBottom: '2px solid #333',
    paddingBottom: '0.3em',
    color: '#fff',
  },
  
  '& h2': {
    fontSize: '1.5em',
    fontWeight: 600,
    marginTop: '1.5em',
    marginBottom: '0.5em',
    color: '#fff',
    borderBottom: '1px solid #2a2a2a',
    paddingBottom: '0.3em',
  },
  
  '& h3': {
    fontSize: '1.25em',
    fontWeight: 600,
    marginTop: '1.2em',
    marginBottom: '0.5em',
    color: '#f0f0f0',
  },
  
  '& h4': {
    fontSize: '1.1em',
    fontWeight: 600,
    marginTop: '1em',
    marginBottom: '0.5em',
    color: '#e0e0e0',
  },
  
  '& p': {
    marginBottom: '1em',
    color: '#d0d0d0',
  },
  
  '& ul, & ol': {
    marginBottom: '1em',
    paddingLeft: '2em',
  },
  
  '& li': {
    marginBottom: '0.5em',
    color: '#d0d0d0',
  },
  
  '& code': {
    backgroundColor: '#2a2a2a',
    padding: '0.2em 0.4em',
    borderRadius: '3px',
    fontFamily: 'ui-monospace, monospace',
    fontSize: '0.9em',
    color: '#ff79c6',
  },
  
  '& pre': {
    backgroundColor: '#2a2a2a',
    padding: '1em',
    borderRadius: '6px',
    overflowX: 'auto',
    marginBottom: '1em',
  },
  
  '& pre code': {
    backgroundColor: 'transparent',
    padding: 0,
    color: '#f8f8f2',
  },
  
  '& strong': {
    fontWeight: 600,
    color: '#fff',
  },
  
  '& em': {
    fontStyle: 'italic',
    color: '#b0b0b0',
  },
  
  '& hr': {
    border: 'none',
    borderTop: '1px solid #333',
    margin: '2em 0',
  },
  
  '& a': {
    color: '#8be9fd',
    textDecoration: 'none',
    
    '&:hover': {
      textDecoration: 'underline',
    },
  },
  
  '& blockquote': {
    borderLeft: '4px solid #555',
    paddingLeft: '1em',
    marginLeft: 0,
    color: '#b0b0b0',
    fontStyle: 'italic',
  },
});

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className={containerStyles}>
      <div className={cardStyles}>
        <div className={markdownStyles}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
