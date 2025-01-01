import { ToolbarButton } from '@jupyterlab/apputils';
import { IFileBrowserFactory, Uploader } from '@jupyterlab/filebrowser';
import { ITranslator } from '@jupyterlab/translation';
// import { folderIcon, newFolderIcon, refreshIcon } from '@jupyterlab/ui-components';
import { FilenameSearcher, folderIcon, newFolderIcon, refreshIcon } from '@jupyterlab/ui-components';
import { ServerConnection } from './serverconnection';
import { Drive } from './drive';
import { toArray } from '@lumino/algorithm';
import { Context } from '@jupyterlab/docregistry';
import { showDialog, Dialog } from '@jupyterlab/apputils';
import { ILauncher } from '@jupyterlab/launcher';
import { SERVICE_DRIVE_URL } from './drive';
import { URLExt } from '@jupyterlab/coreutils';
import { INotebookTracker } from '@jupyterlab/notebook';
import { addInsertDataImportCommand } from './commands';
const DRIVE_NAME = 'Figlinq';
const REMOVE_COMMANDS = ['fileeditor:create-new', 'fileeditor:create-new-markdown-file'];
const noOpDisposable = {
    isDisposed: false,
    dispose: () => {
        /* no-op */
    }
};
// Define the custom implementation for _maybeOverWrite
async function customMaybeOverWrite(path) {
    const body = this._trans.__('"%1" already exists. Do you want to replace it?', path);
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
Context.prototype._maybeOverWrite = customMaybeOverWrite;
// Handle opening of files from URL parameters
const loadFileFromUrlParams = async (commands, widget) => {
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
        };
        const response = await fetch(url);
        if (!response.ok) {
            showErrorDialog();
        }
        else {
            const data = await response.json();
            try {
                commands.execute('docmanager:open', { path: `${DRIVE_NAME}:${data.path}` });
                const pathSplit = data.path.split('/');
                if (pathSplit.length > 1) {
                    cdPath = pathSplit.slice(0, pathSplit.length - 1).join('/');
                }
            }
            catch (error) {
                showErrorDialog();
            }
        }
        widget.model.cd(cdPath);
    }
};
const disableDefaultFileBrowser = (app) => {
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
};
// Define our custom rename, to skip the drive check (gives an error when dropping onto root folder)
async function customRename(path, newPath) {
    const [drive1, path1] = this._driveForPath(path);
    const [, path2] = this._driveForPath(newPath);
    // Disable the drive check, we only have one drive
    // if (drive1 !== drive2 && newPath !== '') {
    //     throw Error('ContentsManager: renaming files must occur within a Drive');
    // }
    return drive1.rename(path1, path2).then((contentsModel) => {
        return Object.assign(Object.assign({}, contentsModel), { path: this._toGlobalPath(drive1, path2) });
    });
}
/**
 * Initialization data for the jupyterlab-remote-contents extension.
 */
const plugin = {
    id: 'jupyterlab-remote-contents:plugin',
    requires: [IFileBrowserFactory, ITranslator, ILauncher, INotebookTracker],
    autoStart: true,
    activate: (app, browser, translator, launcher, notebookTracker) => {
        const { serviceManager, commands } = app;
        const { createFileBrowser } = browser;
        const originalAdd = launcher.add;
        // Override the launcher.add method to filter out unwanted commands
        launcher.add = (options) => {
            if (REMOVE_COMMANDS.includes(options.command)) {
                return noOpDisposable; // Return a no-op disposable
            }
            // Call the original add method for other items
            return originalAdd.call(launcher, options);
        };
        const trans = translator.load('jupyterlab-remote-contents');
        const serverSettings = ServerConnection.makeSettings();
        const drive = new Drive({ serverSettings, name: DRIVE_NAME, browser });
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
            updateFilter: (filterFn, query) => {
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
        addInsertDataImportCommand(commands, notebookTracker, app, widget);
        app.shell.add(widget, 'left');
        loadFileFromUrlParams(commands, widget);
        disableDefaultFileBrowser(app);
        // Override the original rename command with our custom version to avoid drive check
        serviceManager.contents.rename = customRename.bind(serviceManager.contents);
    }
};
export default plugin;
