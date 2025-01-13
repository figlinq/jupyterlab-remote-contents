import { CommandRegistry } from '@lumino/commands';
import { NotebookPanel, NotebookActions, INotebookTracker } from '@jupyterlab/notebook';
import { JupyterFrontEnd } from '@jupyterlab/application';
import { FileBrowser } from '@jupyterlab/filebrowser';
import { showDialog, Dialog } from '@jupyterlab/apputils';
import { Menu } from '@lumino/widgets';
import { mdiViewGridPlusOutline } from '@mdi/js';

import { createIcon, createFiglinqIcon } from './icons';
import { Drive } from './drive';
import { SNIPPETS } from './snippets';

const ORIGIN = window.parent.location.origin;

const showErrorDialog = (body:string, title:string) => {
  showDialog({
      title,
      body,
      buttons: [Dialog.okButton({ label: 'OK' })] 
  });
}

async function insertCode(
    { commands, notebookTracker, app, widget }: { commands: CommandRegistry, notebookTracker: INotebookTracker, app: JupyterFrontEnd, widget: FileBrowser },
  args: any) {  
    
    // Get the active notebook
    const currentNotebook = notebookTracker.currentWidget;
    if (!currentNotebook) {
      showErrorDialog('Please create or open a notebook before executing this action.', 'No notebook open');
      return;
    }
    
    const snippet = args.snippet;
    const notebookPanel = currentNotebook as NotebookPanel;
    const notebook = notebookPanel.content;
    
    if (notebook.activeCell) {
      // Ensure the active cell's model is properly accessed
      const activeCellModel = notebook.activeCell.model;
      if (activeCellModel && activeCellModel.sharedModel) {
        const currentSource = activeCellModel.sharedModel.getSource();
        activeCellModel.sharedModel.setSource(currentSource + '\n' + snippet);
      }
    } else {
      // Insert a new cell below if no active cell
      NotebookActions.insertBelow(notebook);
      
      // Access the newly created cell safely
      const newActiveCell = notebook.activeCell as any;
      if (newActiveCell && newActiveCell.model && newActiveCell.model.sharedModel) {
        newActiveCell.model.sharedModel.setSource(snippet);
      }
    }

  // Ensure the notebook panel is focused
  notebookPanel.content.activate();
}

async function insertDataImportCode(
  { commands, notebookTracker, app, widget }:
    { commands: CommandRegistry, notebookTracker: INotebookTracker, app: JupyterFrontEnd, widget: FileBrowser }) {

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
  const URL =
    ORIGIN.replace("https", "http") +
    "/~" +
    parsedFid[0] +
    "/" +
    parsedFid[1] +
    ".csv".replace("https", "http");
  const snippet = `%pip install pandas\n\nimport requests\nimport pandas as pd\nfrom io import StringIO\n\n# Get data from file ${file.filename}\nresponse = requests.get("${URL}")\ncsv_data = StringIO(response.text)\n# Load the CSV data into a pandas DataFrame\ndf = pd.read_csv(csv_data)\ndf.head()`;

  // Insert the code into the active cell
  insertCode({ commands, notebookTracker, app, widget }, { snippet });
}

async function insertFileUrl(
  { commands, notebookTracker, app, widget }:
    { commands: CommandRegistry, notebookTracker: INotebookTracker, app: JupyterFrontEnd, widget: FileBrowser }) {
  const item = widget.selectedItems().next();
  if (!item) {
    return;
  }
  const pathStr = item.value.path;
  // Remove the drive name from the path
  const path = pathStr.split(":").slice(1).join(":");
  // Lookup the file
  const drive = new Drive();
  const file = await drive.lookup(path);
  if (!file) {
    showErrorDialog(
      `Failed to load file with path ${path}.`,
      "File loading error"
    );
    return;
  } else if (file.filetype !== "grid") {
    showErrorDialog(
      "Only data grid contents can be currently imported.",
      "Unsupported file type"
    );
    return;
  }
  const parsedFid = file.fid.split(":");
  const snippet =
    ORIGIN.replace("https", "http") +
    "/~" +
    parsedFid[0] +
    "/" +
    parsedFid[1] +
    ".csv";
  // Insert the code into the active cell
  insertCode({ commands, notebookTracker, app, widget }, { snippet });
}

const CONTEXT_MENU_COMMANDS = [
  {
    'command': 'filebrowser:fq-insert-data-import-code',
    'label': 'Import Data to Pandas Dataframe',
    'icon': mdiViewGridPlusOutline,
    'execute': insertDataImportCode,
  },
  {
    'command': 'filebrowser:fq-insert-file-url',
    'label': 'Insert File URL',
    'icon': mdiViewGridPlusOutline,
    'execute': insertFileUrl,
  },
];

export function addContextMenuCommands(commands: CommandRegistry, notebookTracker: INotebookTracker, app: JupyterFrontEnd, widget: FileBrowser) {

  const infra = {
    commands,
    notebookTracker,
    app,
    widget
  }

  // Add commands from COMMANDS
  CONTEXT_MENU_COMMANDS.forEach(({ command, label, icon, execute }) => {
    const iconName = command + '-icon';
    commands.addCommand(command, {
      label: label,
      icon: createIcon(iconName, icon),
      execute: () => {
        execute(infra);
      }
    });
  });

  // Create a new sub-menu
  const subMenu = new Menu({ commands });
  subMenu.title.label = 'Figlinq Actions'; // Name of the pull-down menu

  CONTEXT_MENU_COMMANDS.forEach((item) => {
    subMenu.addItem({ command: item.command });
  });

  // Add the separator and sub-menu to the context menu
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

// #######################################

import { ToolbarButton } from '@jupyterlab/apputils';

const TOOLBAR_MENU_COMMANDS = [
    {
      command: 'notebook:fq-insert-chart-studio-import',
      label: 'Import packages to interact with Figlinq',
      'execute': insertCode,
      'args': { snippet: SNIPPETS.installChartStudio }
    },
    {
      command: 'notebook:fq-insert-http-patch',
      label: 'Patch http requests to interact with external contents',
      'execute': insertCode,
      'args': { snippet: SNIPPETS.patchHttp }
    },
    // {
    //   command: 'notebook:fq-clear-all-cells',
    //   label: 'Clear All Cells',
    //   execute: () => {
    //     const currentNotebook = notebookTracker.currentWidget?.content;
    //     if (currentNotebook) {
    //       NotebookActions.clearAllOutputs(currentNotebook);
    //     }
    //   }
    // },
    // {
    //   command: 'notebook:fq-run-all-cells',
    //   label: 'Run All Cells',
    //   execute: () => {
    //     const currentNotebook = notebookTracker.currentWidget?.content;
    //     if (currentNotebook) {
    //       NotebookActions.runAll(currentNotebook);
    //     }
    //   }
    // }
];
  
export function addNotebookToolbarMenu(
  commands: CommandRegistry,
  notebookTracker: INotebookTracker,
  app: JupyterFrontEnd,
) {
  // Define the commands for the pull-down menu
  

  // Register the commands
  TOOLBAR_MENU_COMMANDS.forEach(({ command, label, execute, args}) => {
    commands.addCommand(command, {
      label,
      execute: () => {
        const widget = app.shell.currentWidget as FileBrowser;
        execute({ commands, notebookTracker, app, widget }, args);
      }
    });
  });

  // Create a drop-down menu
  const menu = new Menu({ commands });
  TOOLBAR_MENU_COMMANDS.forEach(({ command }) => {
    menu.addItem({ command });
  });

  // Create a toolbar button that opens the menu
  const menuButton = new ToolbarButton({
    label: 'Figlinq Actions',
    onClick: () => {
      menu.open(
        menuButton.node.getBoundingClientRect().x,
        menuButton.node.getBoundingClientRect().bottom
      );
    },
    icon: createFiglinqIcon(),
  });

  // Add the toolbar button to the notebook toolbar
  app.docRegistry.addWidgetExtension('Notebook', {
    createNew: (panel: NotebookPanel) => {
      panel.toolbar.insertItem(11,'figlinq-menu', menuButton);
      return undefined;
    }
  });
}
