import {
  mdiChartBoxOutline,
  mdiGrid,
  mdiImageOutline,
  mdiTextBoxOutline,
  mdiViewDashboardOutline,
  mdiFileCodeOutline,
  mdiPackageVariantClosed,
  mdiFaceAgent,
  mdiAccountGroup,
  mdiTools,
  mdiFormatListText,
  mdiFolder,
} from '@mdi/js';

import { LabIcon } from '@jupyterlab/ui-components';

export const insertDataImportIconSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>code-block-tags</title><path d="M5.59 3.41L7 4.82L3.82 8L7 11.18L5.59 12.6L1 8L5.59 3.41M11.41 3.41L16 8L11.41 12.6L10 11.18L13.18 8L10 4.82L11.41 3.41M22 6V18C22 19.11 21.11 20 20 20H4C2.9 20 2 19.11 2 18V14H4V18H20V6H17.03V4H20C21.11 4 22 4.89 22 6Z" /></svg>';
export const insertDataImportIconSvgDark =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><title>code-block-tags</title><path d="M5.59 3.41L7 4.82L3.82 8L7 11.18L5.59 12.6L1 8L5.59 3.41M11.41 3.41L16 8L11.41 12.6L10 11.18L13.18 8L10 4.82L11.41 3.41M22 6V18C22 19.11 21.11 20 20 20H4C2.9 20 2 19.11 2 18V14H4V18H20V6H17.03V4H20C21.11 4 22 4.89 22 6Z" /></svg>';

const theme = document.body.classList.contains('theme-light') ? 'light' : 'dark';
const fillColor = theme === 'light' ? 'black' : 'white';

// Create a LabIcon instance
export const createIcon = (path: string) => {
  const svgstr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${path}" fill="${fillColor}" /></svg>`
  return new LabIcon({
    name: path,
    svgstr,
  });
}

export const FILETYPE_TO_ICON: any = {
  'fold':
    {
        name: 'figlinq-folder',
        displayName: 'Figlinq Folder',
        mimeTypes: ['figlinq/folder'],
        extensions: [],
        icon: createIcon(mdiFolder),
  },
  'grid':
    {
        name: 'figlinq-grid',
        displayName: 'Figlinq Data Grid',
        mimeTypes: ['figlinq/grid'],
        extensions: [],
        icon: createIcon(mdiGrid),
  },
  'plot':
    {
        name: 'figlinq-plot',
        displayName: 'Figlinq Plot',
        mimeTypes: ['figlinq/plot'],
        extensions: [],
        icon: createIcon(mdiChartBoxOutline),    
  },
  'figure':
    {
        name: 'figlinq-figure',
        displayName: 'Figlinq Figure',
        mimeTypes: ['figlinq/figure'],
        extensions: [],
        icon: createIcon(mdiViewDashboardOutline),   
  },
  'dashboard':
    {
        name: 'figlinq-collection',
        displayName: 'Figlinq Collection',
        mimeTypes: ['figlinq/collection'],
        extensions: [],
        icon: createIcon(mdiPackageVariantClosed),    
  },
  'external_image':
    {
        name: 'figlinq-external-image',
        displayName: 'Figlinq External Image',
        mimeTypes: ['figlinq/external-image'],
        extensions: [],
        icon: createIcon(mdiImageOutline),   
  },
  'text':
    {
        name: 'figlinq-html-text',
        displayName: 'Figlinq Text',
        mimeTypes: ['figlinq/html-text'],
        extensions: [],
        icon: createIcon(mdiTextBoxOutline), 
  },
  'jupyter_notebook':
    {
        name: 'figlinq-jupyter-notebook',
        displayName: 'Figlinq Jupyter Notebook',
        mimeTypes: ['figlinq/jupyter-notebook'],
        extensions: [],
        icon: createIcon(mdiFileCodeOutline),
  },
  'agent':
    {
        name: 'figlinq-agent',
        displayName: 'Figlinq Agent',
        mimeTypes: ['figlinq/agent'],
        extensions: [],
        icon: createIcon(mdiFaceAgent),
    
  },
  'agent_team':
    {
        name: 'figlinq-agent-team',
        displayName: 'Figlinq Agent Team',
        mimeTypes: ['figlinq/agent-team'],
        extensions: [],
        icon: createIcon(mdiAccountGroup),
    
  },
  'agent_tool':
    {
        name: 'figlinq-agent-tool',
        displayName: 'Figlinq Agent Tool',
        mimeTypes: ['figlinq/agent-tool'],
        extensions: [],
        icon: createIcon(mdiTools),
    
  },
  'agent_workflow':
    {
        name: 'figlinq-agent-workflow',
        displayName: 'Figlinq Agent Workflow',
        mimeTypes: ['figlinq/agent-workflow'],
        extensions: [],
        icon: createIcon(mdiFormatListText),
    
  },
};