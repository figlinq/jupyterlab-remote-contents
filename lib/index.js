import { ToolbarButton } from '@jupyterlab/apputils';
import { IFileBrowserFactory, Uploader } from '@jupyterlab/filebrowser';
import { ITranslator } from '@jupyterlab/translation';
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
import { FILETYPE_TO_ICON } from './icons';
const DRIVE_NAME = 'Figlinq';
const REMOVE_LAUNCHER_COMMANDS = ['fileeditor:create-new', 'fileeditor:create-new-markdown-file'];
// Define the custom implementation for _maybeOverWrite to skip deleting the file in figlinq
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
/**
 * Defines custom rename, to skip the drive check (which gives an error when dropping onto root folder).
 *
 * @param this - The context in which the function is called.
 * @param path - The current path of the file or directory to be renamed.
 * @param newPath - The new path for the file or directory.
 * @returns A promise that resolves to the updated contents model with the new path.
 *
 * @throws Error if renaming files across different drives is attempted.
 */
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
 * Register custom file types
 * @param app The JupyterFrontEnd instance
 * @returns void
 *
**/
function registerCustomFileType(app) {
    const registry = app.docRegistry;
    // Add a custom file types from FILETYPE_TO_ICON object
    Object.keys(FILETYPE_TO_ICON).forEach(fileType => {
        const fileTypeData = FILETYPE_TO_ICON[fileType];
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
const plugin = {
    id: 'jupyterlab-remote-contents:plugin',
    requires: [IFileBrowserFactory, ITranslator, ILauncher, INotebookTracker],
    autoStart: true,
    activate: (app, browser, translator, launcher, notebookTracker) => {
        const { serviceManager, commands, docRegistry } = app;
        const { createFileBrowser } = browser;
        const originalAdd = launcher.add;
        // Override the launcher.add method to filter out unwanted commands
        launcher.add = (options) => {
            if (REMOVE_LAUNCHER_COMMANDS.includes(options.command)) {
                const noOpDisposable = {
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
        registerCustomFileType(app);
        // Override the original getFileTypeForModel method to handle custom MIME types
        const originalGetFileTypeForModel = docRegistry.getFileTypeForModel;
        docRegistry.getFileTypeForModel = function (model) {
            const fileTypesArray = Array.from(this.fileTypes());
            if (model.mimetype) {
                const mimeMatch = fileTypesArray.find(ft => ft.mimeTypes.includes(model.mimetype));
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
        // Override the original rename command with our custom version to avoid drive check
        serviceManager.contents.rename = customRename.bind(serviceManager.contents);
    }
};
export default plugin;
