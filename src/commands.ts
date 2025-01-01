import { CommandRegistry } from '@lumino/commands';
import { NotebookPanel, NotebookActions, INotebookTracker } from '@jupyterlab/notebook';
import { JupyterFrontEnd } from '@jupyterlab/application';
import { LabIcon } from '@jupyterlab/ui-components';
import { FileBrowser } from '@jupyterlab/filebrowser';
import { Drive } from './drive';

const insertDataImportIconSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>code-block-tags</title><path d="M5.59 3.41L7 4.82L3.82 8L7 11.18L5.59 12.6L1 8L5.59 3.41M11.41 3.41L16 8L11.41 12.6L10 11.18L13.18 8L10 4.82L11.41 3.41M22 6V18C22 19.11 21.11 20 20 20H4C2.9 20 2 19.11 2 18V14H4V18H20V6H17.03V4H20C21.11 4 22 4.89 22 6Z" /></svg>';

// Create a LabIcon instance
const insertDataImportIcon = new LabIcon({
    name: 'my-icon',
    svgstr: insertDataImportIconSvg
});

export function addInsertDataImportCommand(commands: CommandRegistry, notebookTracker: INotebookTracker, app: JupyterFrontEnd, widget: FileBrowser) {
    const command = 'filebrowser:fq-insert-data-import-code';
    commands.addCommand(command, {
      label: 'Insert Data Import Code',
      icon: insertDataImportIcon,
      execute: async () => {

        const item = widget.selectedItems().next();
        if (!item) {
          return;
        }
        const pathStr = item.value.path;
        // Remove the drive name from the path
        const path = pathStr.split(':').slice(1).join(':');
        console.log('Selected file path:', path);

        // Lookup the file
        const drive = new Drive();
        const file = await drive.lookup(path);
        if (!file) {
          console.warn('File not found:', path);
          return;
        }
        console.log('File found:', file);

        // Get the active notebook
        const currentNotebook = notebookTracker.currentWidget;
        if (!currentNotebook) {
          console.warn('No active notebook found!');
          return;
        }

        const notebookPanel = currentNotebook as NotebookPanel;
        const notebook = notebookPanel.content;

        // Insert code into the active cell or create a new cell
        const codeToInsert = `# This code will load data from your Figlinq file \nprint("Hello from the file browser!")`;

        if (notebook.activeCell) {
          // Ensure the active cell's model is properly accessed
          const activeCellModel = notebook.activeCell.model;
          if (activeCellModel && activeCellModel.sharedModel) {
            const currentSource = activeCellModel.sharedModel.getSource();
            activeCellModel.sharedModel.setSource(currentSource + '\n' + codeToInsert);
          }
        } else {
          // Insert a new cell below if no active cell
          NotebookActions.insertBelow(notebook);
        
          // Access the newly created cell safely
          const newActiveCell = notebook.activeCell as any;
          if (newActiveCell && newActiveCell.model && newActiveCell.model.sharedModel) {
            newActiveCell.model.sharedModel.setSource(codeToInsert);
          }
        }

        // Ensure the notebook panel is focused
        notebookPanel.content.activate();
      }
    });

    app.contextMenu.addItem({
      command,
      selector: '.jp-DirListing-item',
      rank: 10,
    });
  }