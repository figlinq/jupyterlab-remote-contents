import { CommandRegistry } from '@lumino/commands';
import { NotebookPanel, NotebookActions, INotebookTracker } from '@jupyterlab/notebook';
import { JupyterFrontEnd } from '@jupyterlab/application';
import { FileBrowser } from '@jupyterlab/filebrowser';
import { Drive } from './drive';
import { showDialog, Dialog } from '@jupyterlab/apputils';
import { Menu } from '@lumino/widgets';
import { createIcon } from './icons';
import { mdiViewGridPlusOutline } from '@mdi/js';

const showErrorDialog = (body:string, title:string) => {
  showDialog({
      title,
      body,
      buttons: [Dialog.okButton({ label: 'OK' })] 
  });
}

export function addInsertDataImportCommand(commands: CommandRegistry, notebookTracker: INotebookTracker, app: JupyterFrontEnd, widget: FileBrowser) {
    const command = 'filebrowser:fq-insert-data-import-code';

    commands.addCommand(command, {
      label: 'Insert Data Import Code',
      icon: createIcon(mdiViewGridPlusOutline),
      execute: async () => {

        const item = widget.selectedItems().next();
        if (!item) {
          return;
        }
        const pathStr = item.value.path;
        // Remove the drive name from the path
        const path = pathStr.split(':').slice(1).join(':');

        // Lookup the file
        const drive = new Drive();
        const file = await drive.lookup(path);
        if (!file) {
          showErrorDialog(`Failed to load file with path ${path}.`, 'File loading error');
          return;
        } else if (file.filetype !== 'grid') {
          showErrorDialog('Only data grid contents can be currently imported.', 'Unsupported file type');
          return;
        }
        const parsedFid = file.fid.split(':')
        const URL = window.location.origin + '/~' + parsedFid[0] + '/' + parsedFid[1] + '.csv';

        // Get the active notebook
        const currentNotebook = notebookTracker.currentWidget;
        if (!currentNotebook) {
          showErrorDialog('Please create or open a notebook before executing this action.', 'No notebook open');
          return;
        }

        const notebookPanel = currentNotebook as NotebookPanel;
        const notebook = notebookPanel.content;

        // Insert code into the active cell or create a new cell
        const codeToInsert = `# Patch http requests (required for importing data into Python execution environment) \nimport pyodide_http\npyodide_http.patch_all()\n# Load data from ${file.filename} to Pandas dataframe\nimport pandas as pd\ndata = pd.read_csv('${URL}')\ndata.head()`;

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

    // Create a new sub-menu
    const subMenu = new Menu({ commands });
    subMenu.title.label = 'Figlinq Actions'; // Name of the pull-down menu
    subMenu.addItem({ command }); // Add the command to the sub-menu

  // Add the sub-menu to the context menu
    app.contextMenu.addItem({
      type: 'separator', // Add a divider
      selector: '.jp-DirListing-item', // Ensure it appears in the same context
      rank: 9.9, // Choose a rank slightly less than the submenu to place it before
    });
    app.contextMenu.addItem({
        type: 'submenu', // Indicate it's a sub-menu
        submenu: subMenu, // Attach the sub-menu
        selector: '.jp-DirListing-item', // Selector for the context menu item
        rank: 10, // Rank in the context menu
    });
  }