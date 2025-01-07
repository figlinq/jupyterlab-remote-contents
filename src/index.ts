import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { ToolbarButton } from '@jupyterlab/apputils';
import { IFileBrowserFactory, Uploader } from '@jupyterlab/filebrowser';
import { ITranslator } from '@jupyterlab/translation';
import { FilenameSearcher, IScore, folderIcon, newFolderIcon, refreshIcon } from '@jupyterlab/ui-components';
import { ServerConnection } from './serverconnection';
import { toArray } from '@lumino/algorithm';
import { Contents } from '@jupyterlab/services';
import { Context } from '@jupyterlab/docregistry';
import { showDialog, Dialog } from '@jupyterlab/apputils';
import { ILauncher } from '@jupyterlab/launcher';
import { IDisposable } from '@lumino/disposable';
import { URLExt } from '@jupyterlab/coreutils';
import { INotebookTracker } from '@jupyterlab/notebook';
import { addContextMenuCommands, addNotebookToolbarMenu } from './commands';
import { getFileTypeToIcon } from './icons';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { InputDialog } from '@jupyterlab/apputils';

import { Drive } from './drive';
import { SERVICE_DRIVE_URL } from './drive';

const DRIVE_NAME = 'Figlinq';
const REMOVE_LAUNCHER_COMMANDS = ['fileeditor:create-new', 'fileeditor:create-new-markdown-file'];

// Iframe communication
const callParent = (action:string): Promise<{currentUser:string}> =>
  new Promise((res, rej) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = ({data}) => {
      channel.port1.close();
      if (data.error) {
        rej(data.error);
      } else {
        res(data.result);
      }
    };
    parent.postMessage([action], '*', [channel.port2]);
  });

// Define the custom implementation for _maybeOverWrite to skip deleting the file in figlinq
async function customMaybeOverWrite(this: any, path: string): Promise<void> {
  const body = this._trans.__(
    '"%1" already exists. Do you want to replace it?',
    path
  );

  const overwriteBtn = Dialog.warnButton({
    label: this._trans.__('Overwrite'),
    accept: true
  });

  return showDialog({
    title: this._trans.__('File Overwrite?'),
    body,
    buttons: [Dialog.cancelButton(), overwriteBtn]
  }).then(result => {
    if (this.isDisposed) {
      return Promise.reject(new Error('Disposed'));
    }

    if (result.button.accept) {
      // Skip deleting the file, just proceed with the save operation.
      return this._finishSaveAs(path);
    }
  });
}

// Override the method on the prototype, bypassing the private visibility restriction
(Context.prototype as any)._maybeOverWrite = customMaybeOverWrite;

/**
 * Loads a file from URL parameters and opens it in the document manager.
 *
 * @param commands - The command registry used to execute commands.
 * @param widget - The widget whose model will be updated with the file's directory path.
 *
 * This function retrieves the file ID (fid) from the URL parameters. If the fid is present,
 * it constructs a URL to fetch the file path associated with the fid. If the fetch request
 * is successful, it opens the file using the document manager and updates the widget's model
 * with the directory path of the file. If the fetch request fails or an error occurs while
 * opening the file, an error dialog is displayed.
 */
const loadFileFromUrlParams = async (commands: any, widget: any) => {
  const urlParams = new URLSearchParams(window.parent.location.search);
  const fid = urlParams.get('fid') || '';
  if (fid) {
    // GET file path from fid
    let cdPath = '/';
    const parts = [
      SERVICE_DRIVE_URL,
      'files',
      fid,
      'path'
    ];
    const partsEncoded = parts.map(part => URLExt.encodeParts(part));
    const url = '/' + partsEncoded.join('/');

    const showErrorDialog = () => {
      showDialog({
        title: 'FIle loading error',
        body: `Failed to load file with id ${fid}.`,
        buttons: [Dialog.okButton({ label: 'OK' })]
      });
    }

    const response = await fetch(url);
    if (!response.ok) {
      showErrorDialog();
    } else {
      const data = await response.json();
      try {
        commands.execute('docmanager:open', { path: `${DRIVE_NAME}:${data.path}` });
        const pathSplit = data.path.split('/')
        if (pathSplit.length > 1) {
          cdPath = pathSplit.slice(0, pathSplit.length - 1).join('/');
        }
      } catch (error) {
        showErrorDialog();
      }
    }
    widget.model.cd(cdPath);
  } else {
    widget.model.cd('/');
  }
};

/**
 * Disables the default file browser in a JupyterFrontEnd application.
 *
 * This function attempts to find and dispose of the default file browser widget
 * in the left sidebar of the JupyterLab interface. If the default file browser
 * is found, it is disposed of and the remote contents browser is activated.
 * If the default file browser is not found immediately, a periodic timer is
 * used to check for the file browser every 100 milliseconds until it is found
 * and handled.
 *
 * @param app - The JupyterFrontEnd application instance.
 */
const disableDefaultFileBrowser = (app: JupyterFrontEnd) => {
  const handleFileBrowser = () => {
    const widgets = toArray(app.shell.widgets('left'));
    const defaultBrowser = widgets.find(widget => widget.id === 'filebrowser');
    if (defaultBrowser) {
      defaultBrowser.dispose();
      app.shell.activateById('jp-remote-contents-browser');
      return true; // Found and handled
    }
    return false; // Not found
  };

  // Disable the default file browser
  // Try finding the file browser immediately
  if (!handleFileBrowser()) {
    // Fallback: Use a periodic timer to check for the file browser
    const interval = setInterval(() => {
      if (handleFileBrowser()) {
        clearInterval(interval); // Stop checking once handled
      }
    }, 100); // Check every 100ms
  }
}

/**
 * Custom implementation of the _driveForPath method to use the custom drive only.
 *
 * @param path - The path for which the drive is to be determined.
 * @returns A tuple containing the custom drive and the local path.
 */
function customDriveForPath(this: any, path: string): [Contents.IDrive, string] {
  const localPath = this.localPath(path);
  return [this._additionalDrives.get(DRIVE_NAME), localPath];
}

/**
 * Patch the InputDialog.getText method to remove the drive name from the text field
 */
function patchInputDialog() {
  const originalGetText = InputDialog.getText;
  // Override the getText function
  InputDialog.getText = function (options) {
    // Check if the 'text' starts with your drive name (e.g., 'Figlinq:')
    if (options.text?.startsWith(`${DRIVE_NAME}:`)) {
      const regex = new RegExp(`^${DRIVE_NAME}:`);
      options.text = options.text.replace(regex, ''); // Removes 'Figlinq:' from the start
    }

    // Call the original getText function with modified options
    return originalGetText(options);
  };
}

/**
 * Register custom file types
 * @param app The JupyterFrontEnd instance
 * @returns void
 * 
**/
function registerCustomFileTypes(app: JupyterFrontEnd) {
  const registry = app.docRegistry;
  const filetypeToIcon = getFileTypeToIcon();

  // Add a custom file types from FILETYPE_TO_ICON object
  
  Object.keys(filetypeToIcon).forEach(fileType => {
    const fileTypeData = filetypeToIcon[fileType];
    registry.addFileType({
      name: fileTypeData.name,
      displayName: fileTypeData.displayName,
      mimeTypes: fileTypeData.mimeTypes,
      extensions: fileTypeData.extensions,
      icon: fileTypeData.icon,
    });
  });
}

/**
 * Initialization data for the jupyterlab-remote-contents extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab-remote-contents:plugin',
  requires: [IFileBrowserFactory, ITranslator, ILauncher, INotebookTracker, IDocumentManager],
  autoStart: true,
  activate: async (
    app: JupyterFrontEnd,
    browser: IFileBrowserFactory,
    translator: ITranslator,
    launcher: ILauncher,
    notebookTracker: INotebookTracker,
    docManager: IDocumentManager
  ) => {
    const { serviceManager, commands, docRegistry } = app;
    const { createFileBrowser } = browser;

    function getSessionDataWithTimeout() {
      return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        clearInterval(interval);
        reject(new Error('Session data retrieval timed out'));
      }, 5000);

      const interval = setInterval(async () => {
        const sessionData = await callParent('getSessionData');
        const currentUser = sessionData?.currentUser;
        if (currentUser !== null) {
        clearTimeout(timeout);
        clearInterval(interval);
        resolve(sessionData);
        }
      }, 200);
      });
    }

    let sessionData;
    try {
      sessionData = await getSessionDataWithTimeout();
      console.log('Session data:', sessionData);
    } catch (error) {
      showDialog({
        title: 'Session Error',
        body: 'Failed to retrieve session data within the timeout period.',
        buttons: [Dialog.okButton({ label: 'OK' })]
      }).then(() => {
        window.location.href = '/login';
      });
    }

    console.log('Session data:', sessionData);

    const originalAdd = launcher.add;
    // Override the launcher.add method to filter out unwanted commands
    launcher.add = (options: ILauncher.IItemOptions) => {
      if (REMOVE_LAUNCHER_COMMANDS.includes(options.command)) {
        const noOpDisposable: IDisposable = {
          isDisposed: false,
          dispose: () => {
            /* no-op */
          }
        };
        return noOpDisposable; // Return a no-op disposable
      }
      // Call the original add method for other items
      return originalAdd.call(launcher, options);
    };
    
    const trans = translator.load('jupyterlab-remote-contents');
    const serverSettings = ServerConnection.makeSettings();
    const drive = new Drive({serverSettings, name: DRIVE_NAME, browser});

    serviceManager.contents.addDrive(drive);

    const widget = createFileBrowser('jp-remote-contents-browser', {
      driveName: drive.name,
      // We don't want to restore old state, we don't have a drive handle ready
      restore: false
    });
    widget.title.caption = trans.__('My files');
    widget.title.icon = folderIcon;    
    
    const createNewDirectoryButton = new ToolbarButton({
      icon: newFolderIcon,
      onClick: async () => {
        widget.createNewDirectory();
      },
      tooltip: trans.__('New Folder')
    });

    const uploader = new Uploader({ model: widget.model, translator });

    const refreshButton = new ToolbarButton({
      icon: refreshIcon,
      onClick: async () => {
        widget.model.refresh();
      },
      tooltip: trans.__('Refresh File Browser')
    });

    const searcher = FilenameSearcher({
      updateFilter: (
        filterFn: (item: string) => Partial<IScore> | null,
        query?: string
      ) => {
        widget.model.setFilter(value => {
          return filterFn(value.name.toLowerCase());
        });
      },
      useFuzzyFilter: true,
      placeholder: trans.__('Filter files by name'),
      forceRefresh: true
    });
    
    widget.toolbar.insertItem(1, 'create-new-directory', createNewDirectoryButton);
    widget.toolbar.insertItem(2, 'upload', uploader);
    widget.toolbar.insertItem(3, 'refresh', refreshButton);
    widget.toolbar.insertItem(4, 'search', searcher);
    
    addContextMenuCommands(commands, notebookTracker, app, widget);
    addNotebookToolbarMenu(commands, notebookTracker, app);
    registerCustomFileTypes(app);

    // Override the original getFileTypeForModel method to handle custom MIME types
    const originalGetFileTypeForModel = docRegistry.getFileTypeForModel;
    docRegistry.getFileTypeForModel = function (model: Partial<Contents.IModel>) {
        const fileTypesArray = Array.from(this.fileTypes());
        if (model.mimetype) {
            const mimeMatch = fileTypesArray.find(ft => ft.mimeTypes.includes(model.mimetype!));
            if (mimeMatch) {
                return mimeMatch;
            }
        }
        // Fallback to the original behavior
        return originalGetFileTypeForModel.call(this, model);
    };

    app.shell.add(widget, 'left');
    
    loadFileFromUrlParams(commands, widget);
    disableDefaultFileBrowser(app);

    // Patch the input dialog to remove the drive name from the text field
    patchInputDialog();
    // Override the _driveForPath command to use our custom drive only
    (serviceManager.contents as any)._driveForPath = customDriveForPath.bind(serviceManager.contents);
  }
};

export default plugin;
