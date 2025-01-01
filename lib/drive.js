import { ServerConnection } from './serverconnection';
import { Signal } from '@lumino/signaling';
import { URLExt } from '@jupyterlab/coreutils';
import { IFileBrowserFactory } from '@jupyterlab/filebrowser';
// import { showDialog, Dialog } from '@jupyterlab/apputils';
/**
 * The url for the default drive service.
 */
export const SERVICE_DRIVE_URL = 'v2/';
/**
 * The url for the file access.
 */
const FILES_URL = 'files';
const EMPTY_NOTEBOOK = {
    cells: [],
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5
};
/**
 * Mapping of plotly filetype to Jupyter file type.
 */
const FILETYPE_TO_TYPE = {
    'fold': 'directory',
    'html_text': 'file',
    'grid': 'file',
    'plot': 'file',
    'external_image': 'file',
    'jupyter_notebook': 'notebook',
};
const FILETYPE_TO_MIMETYPE = {
    "html_text": "text/html",
    "grid": "application/json",
    "jupyter_notebook": "application/x-ipynb+json",
};
const TYPE_TO_MIMETYPE = {
    'directory': 'application/x-directory',
    'file': 'text/plain',
    'notebook': 'application/x-ipynb+json',
};
const TYPE_TO_FORMAT = {
    'directory': 'json',
    'file': 'text',
    'notebook': 'json',
};
/**
 * A default implementation for an `IDrive`, talking to the
 * server using the Jupyter REST API.
 */
export class Drive {
    /**
     * Construct a new contents manager object.
     *
     * @param options - The options used to initialize the object.
     */
    constructor(options = {
        browser: IFileBrowserFactory
    }) {
        this.browser = options.browser;
        this.name = options.name ?? 'Default';
        this._apiEndpoint = options.apiEndpoint ?? SERVICE_DRIVE_URL;
        this.serverSettings =
            options.serverSettings ?? ServerConnection.makeSettings();
    }
    /**
     * The name of the drive, which is used at the leading
     * component of file paths.
     */
    name;
    /**
     * The file browser factory.
     * This is used to refresh the file browser after a file operation.
     */
    browser;
    /**
     * A signal emitted when a file operation takes place.
     */
    get fileChanged() {
        return this._fileChanged;
    }
    /**
     * The server settings of the drive.
     */
    serverSettings;
    /**
     * Test whether the manager has been disposed.
     */
    get isDisposed() {
        return this._isDisposed;
    }
    /**
     * Dispose of the resources held by the manager.
     */
    dispose() {
        if (this.isDisposed) {
            return;
        }
        this._isDisposed = true;
        Signal.clearData(this);
    }
    async lookup(localPath) {
        const args = ['files', 'lookup'];
        const url = this._getUrl(...args);
        let params = { path: localPath };
        const response = await ServerConnection.makeRequest(this.serverSettings, url, {}, params);
        if (response.status !== 200) {
            const err = await ServerConnection.ResponseError.create(response);
            throw err;
        }
        let data = await response.json();
        return data;
    }
    // async restore(fid: string): Promise<any>{
    //   const args = ['files', fid, 'restore'];
    //   const url = this._getUrl(...args);
    //   const response = await ServerConnection.makeRequest(this.serverSettings, url, {method: 'POST'});
    //   if (response.status !== 200) {
    //     const err = await ServerConnection.ResponseError.create(response);
    //     console.log('restore error', err);
    //     throw err;
    //   }
    //   let data = await response.json();
    //   return data;
    // }
    /**
     * Get a file or directory.
     *
     * @param localPath: The path to the file.
     *
     * @param options: The options used to fetch the file.
     *
     * @returns A promise which resolves with the file content.
     *
     * Uses the [Jupyter Notebook API](https://petstore.swagger.io/?url=https://raw.githubusercontent.com/jupyter-server/jupyter_server/main/jupyter_server/services/api/api.yaml#!/contents) and validates the response model.
     */
    async get(localPath, options) {
        // console.log('get', localPath, options);
        let filetype = 'fold';
        let lookup;
        let filename = '';
        let pathParts = [];
        let params = {};
        // We need to do a lookup first to determine the appropriate api path
        if (localPath) {
            lookup = await this.lookup(localPath);
            // Get the filetype and filename from the lookup      
            filetype = lookup.filetype;
            filename = lookup.filename;
            if (filetype === 'fold') {
                pathParts = ['folders', lookup.fid];
                params = { page: 1, page_size: 100000, order_by: 'filename' };
            }
            else if (filetype === 'jupyter_notebook') {
                pathParts = ['jupyter-notebooks', lookup.fid, 'content'];
            }
            else {
                throw new Error("Currently you can only open notebooks and folders!");
            }
        }
        else { // For home directory we do not need to do a lookup  
            pathParts = ['folders', 'home'];
            params = { page: 1, page_size: 100000, order_by: 'filename' };
            lookup = {
                date_modified: '',
                creation_time: '',
            };
        }
        const url = this._getUrl(...pathParts);
        // if (options) {
        //   // The notebook type cannot take a format option.
        //   if (options.type === 'notebook') {
        //     delete options['format'];
        //   }
        //   const content = options.content ? '1' : '0';
        //   params = {...params, ...options, content };
        // }
        const response = await ServerConnection.makeRequest(this.serverSettings, url, {}, params);
        if (response.status !== 200) {
            console.log(response.json());
            const err = await ServerConnection.ResponseError.create(response);
            throw err;
        }
        let data = await response.json();
        const convOptions = {
            data: data?.file || data,
            type: FILETYPE_TO_TYPE[filetype],
            name: filename,
            path: localPath,
            last_modified: lookup.date_modified,
            created: lookup.creation_time,
        };
        let model;
        try {
            model = Private.convertToJupyterApi(convOptions);
        }
        catch (error) {
            console.error('Error converting to Jupyter API', error);
        }
        Private.validateContentsModel(model);
        return model;
    }
    /**
     * Get an encoded download url given a file path.
     *
     * @param localPath - An absolute POSIX file path on the server.
     *
     * #### Notes
     * It is expected that the path contains no relative paths.
     *
     * The returned URL may include a query parameter.
     */
    getDownloadUrl(localPath) {
        const baseUrl = this.serverSettings.baseUrl;
        let url = URLExt.join(baseUrl, FILES_URL, URLExt.encodeParts(localPath));
        const xsrfTokenMatch = document.cookie.match('\\b_xsrf=([^;]*)\\b');
        if (xsrfTokenMatch) {
            const fullUrl = new URL(url);
            fullUrl.searchParams.append('_xsrf', xsrfTokenMatch[1]);
            url = fullUrl.toString();
        }
        return Promise.resolve(url);
    }
    /**
     * Saves existing notebook in the specified directory path.
     *
     * @param options: The options used to create the file, including content
     *
     * @returns A promise which resolves with the created file content when the
     *    file is created.
     *
     * #### Notes
     * Uses the [Jupyter Notebook API](https://petstore.swagger.io/?url=https://raw.githubusercontent.com/jupyter-server/jupyter_server/main/jupyter_server/services/api/api.yaml#!/contents) and validates the response model.
     */
    async saveNotebookAs(options) {
        console.log('saveNotebookAs', options);
        let args = [];
        let body;
        let headers;
        let fileName = 'Untitled notebook.ipynb';
        let refreshBrowser = false;
        let parentIdLocal;
        const splitPath = options.path.split('/');
        if (splitPath.length === 1) { // Home directory, with just filename provided in path
            parentIdLocal = -1;
            fileName = options.path;
            refreshBrowser = true;
        }
        else { // In subdirectory
            const parentPath = splitPath.slice(0, splitPath.length - 1).join('/');
            const parentLookup = await this.lookup(parentPath);
            const parentFid = parentLookup.fid;
            parentIdLocal = parseInt(parentFid.split(':')[1]);
            fileName = splitPath[splitPath.length - 1];
        }
        args = ['jupyter-notebooks', 'upload'];
        body = JSON.stringify(options.content);
        headers = {
            'plotly-parent': `${parentIdLocal}`,
            'plotly-world-readable': 'false',
            'x-file-name': fileName,
            'content-type': 'application/json',
        };
        const url = this._getUrl(...args);
        const init = {
            method: 'POST',
            body,
            headers,
        };
        const response = await ServerConnection.makeRequest(this.serverSettings, url, init);
        if (response.status !== 201) {
            const err = await ServerConnection.ResponseError.create(response);
            throw err;
        }
        const data = await response.json();
        const convOptions = {
            data: data.file,
            type: options.type,
            name: data.file.filename,
            path: options.path,
            last_modified: data.file.date_modified,
            created: data.file.creation_time,
        };
        // Transform the API response to a Contents.IModel
        let model;
        try {
            model = Private.convertToJupyterApi(convOptions);
        }
        catch (error) {
            console.error('Error converting to Jupyter API', error);
        }
        Private.validateContentsModel(model);
        this._fileChanged.emit({
            type: 'new',
            oldValue: null,
            newValue: model
        });
        if (refreshBrowser) {
            this.refreshBrowser();
        }
        return model;
    }
    /**
     * Create a new untitled file or directory in the specified directory path.
     *
     * @param options: The options used to create the file.
     *
     * @returns A promise which resolves with the created file content when the
     *    file is created.
     *
     * #### Notes
     * Uses the [Jupyter Notebook API](https://petstore.swagger.io/?url=https://raw.githubusercontent.com/jupyter-server/jupyter_server/main/jupyter_server/services/api/api.yaml#!/contents) and validates the response model.
     */
    async newUntitled(options = {}) {
        console.log('newUntitled', options);
        let args = [];
        let body;
        let headers;
        let fileName = 'Untitled notebook.ipynb';
        let refreshBrowser = false;
        if (options.type === 'notebook') {
            console.log('newUntitled notebook');
            let parent;
            if (!options.path) { // Home directory
                parent = -1;
                refreshBrowser = true;
            }
            else { // In subdirectory
                const parentLookup = await this.lookup(options.path);
                const parentFid = parentLookup.fid;
                parent = parseInt(parentFid.split(':')[1]);
            }
            args = ['jupyter-notebooks', 'upload'];
            body = JSON.stringify(EMPTY_NOTEBOOK);
            headers = {
                'plotly-parent': `${parent}`,
                'plotly-world-readable': 'false',
                'x-file-name': fileName,
                'content-type': 'application/json',
            };
        }
        else if (options.type === 'directory') {
            console.log('newUntitled directory');
            fileName = 'Unnamed Folder';
            args = ['folders'];
            let parent;
            if (!options.path) {
                parent = -1;
            }
            else {
                const lookup = await this.lookup(options.path);
                const fid = lookup.fid;
                parent = fid.split(':')[1];
            }
            body = JSON.stringify({
                "parent": parent,
                "path": "Unnamed Folder",
            });
            headers = {
                'content-type': 'application/json',
            };
        }
        const url = this._getUrl(...args);
        const init = {
            method: 'POST',
            body,
            headers,
        };
        const response = await ServerConnection.makeRequest(this.serverSettings, url, init);
        if (response.status !== 201) {
            const err = await ServerConnection.ResponseError.create(response);
            throw err;
        }
        const data = await response.json();
        const newFileName = data.file.filename;
        const newLocalPath = options.path ? `${options.path}/${newFileName}` : newFileName;
        const convOptions = {
            data: data.file,
            type: options.type,
            name: newFileName,
            path: newLocalPath,
            last_modified: data.file.date_modified,
            created: data.file.creation_time,
        };
        // Transform the API response to a Contents.IModel
        let model;
        try {
            model = Private.convertToJupyterApi(convOptions);
        }
        catch (error) {
            console.error('Error converting data to Jupyter API', error);
        }
        Private.validateContentsModel(model);
        this._fileChanged.emit({
            type: 'new',
            oldValue: null,
            newValue: model
        });
        if (refreshBrowser) {
            this.refreshBrowser();
        }
        return model;
    }
    /**
     * Delete a file.
     *
     * @param localPath - The path to the file.
     *
     * @returns A promise which resolves when the file is deleted.
     *
     * #### Notes
     * Uses the [Jupyter Notebook API](https://petstore.swagger.io/?url=https://raw.githubusercontent.com/jupyter-server/jupyter_server/main/jupyter_server/services/api/api.yaml#!/contents).
     */
    async delete(localPath) {
        const lookup = await this.lookup(localPath);
        const fid = lookup.fid;
        const parent = lookup.parent;
        const url = this._getUrl(...['files', fid, 'trash']);
        const init = { method: 'POST' };
        const response = await ServerConnection.makeRequest(this.serverSettings, url, init);
        if (response.status !== 200) {
            const err = await ServerConnection.ResponseError.create(response);
            throw err;
        }
        this._fileChanged.emit({
            type: 'delete',
            oldValue: { path: localPath },
            newValue: null
        });
        if (parent === -1) {
            this.refreshBrowser();
        }
    }
    /**
     * Rename a file or directory.
     *
     * @param oldLocalPath - The original file path.
     *
     * @param newLocalPath - The new file path.
     *
     * @returns A promise which resolves with the new file contents model when
     *   the file is renamed.
     *
     * #### Notes
     * Uses the [Jupyter Notebook API](https://petstore.swagger.io/?url=https://raw.githubusercontent.com/jupyter-server/jupyter_server/main/jupyter_server/services/api/api.yaml#!/contents) and validates the response model.
     */
    async rename(oldLocalPath, newLocalPath) {
        console.log('rename', oldLocalPath, newLocalPath);
        const fileLookup = await this.lookup(oldLocalPath);
        // Renaming can include moving the file to a new directory, in this case we need check the parent in newLocalPath vs oldLocalPath (find last posix part)
        // Last part is the file. Prior parts are the directories.
        const oldPathParts = oldLocalPath.split('/');
        const newPathParts = newLocalPath.split('/');
        const newFileName = newPathParts[newPathParts.length - 1];
        const oldParentPath = oldPathParts.slice(0, oldPathParts.length - 1).join('/');
        const newParentPath = newPathParts.slice(0, newPathParts.length - 1).join('/');
        let newParentIdlocal;
        if (newParentPath === '') { // root directory
            newParentIdlocal = -1;
        }
        else if (oldParentPath !== newParentPath) { // moving to a new directory
            const newParentLookup = await this.lookup(newParentPath);
            newParentIdlocal = newParentLookup.fid.split(':')[1];
            newParentIdlocal = parseInt(newParentIdlocal);
        }
        else { // same directory
            newParentIdlocal = fileLookup.parent;
        }
        // PATCH /files/{fid}
        let pathParts = [];
        pathParts.push('files');
        pathParts.push(fileLookup.fid);
        const url = this._getUrl(...pathParts);
        fileLookup.filename = newFileName;
        fileLookup.parent = newParentIdlocal;
        const apiObj = {
            "filename": newFileName,
            "parent": newParentIdlocal,
            "fid": fileLookup.fid,
        };
        const headers = {
            'content-type': 'application/json',
        };
        const init = {
            method: 'PATCH',
            body: JSON.stringify(apiObj),
            headers,
        };
        const response = await ServerConnection.makeRequest(this.serverSettings, url, init);
        if (response.status !== 200) {
            const err = await ServerConnection.ResponseError.create(response);
            throw err;
        }
        const data = await response.json();
        const convOptions = {
            data: null,
            type: FILETYPE_TO_TYPE[fileLookup.filetype],
            name: newFileName,
            path: newLocalPath,
            last_modified: data.date_modified,
            created: data.creation_time,
        };
        let model;
        try {
            model = Private.convertToJupyterApi(convOptions);
        }
        catch (error) {
            console.error('Error converting to Jupyter API', error);
        }
        Private.validateContentsModel(model);
        this._fileChanged.emit({
            type: 'rename',
            oldValue: { path: oldLocalPath },
            newValue: { path: newLocalPath },
        });
        this.refreshBrowser();
        return model;
    }
    /**
     * Save a file.
     *
     * @param localPath - The desired file path.
     *
     * @param options - Optional overrides to the model.
     *
     * @returns A promise which resolves with the file content model when the
     *   file is saved.
     *
     * #### Notes
     * Ensure that `model.content` is populated for the file.
     *
     * Uses the [Jupyter Notebook API](https://petstore.swagger.io/?url=https://raw.githubusercontent.com/jupyter-server/jupyter_server/main/jupyter_server/services/api/api.yaml#!/contents) and validates the response model.
     */
    async save(localPath, options = {}) {
        console.log('save', localPath, options);
        let lookup;
        // Jupyterlite deletes the file and creates a new one, so we need to restore it from the trash if it is trashed
        try {
            lookup = options.path ? await this.lookup(options.path) : null;
        }
        catch {
            // File does not exist, saving a new file
            return this.saveNotebookAs(options);
        }
        const body = JSON.stringify({ content: JSON.stringify(options.content) });
        const headers = {
            'content-type': 'application/json',
        };
        const url = this._getUrl(...['jupyter-notebooks', lookup.fid]);
        const init = {
            method: 'PATCH',
            body,
            headers,
        };
        const response = await ServerConnection.makeRequest(this.serverSettings, url, init);
        // will return 200 for an existing file and 201 for a new file
        if (response.status !== 200 && response.status !== 201) {
            const err = await ServerConnection.ResponseError.create(response);
            throw err;
        }
        const data = await response.json();
        const convOptions = {
            data: null,
            type: FILETYPE_TO_TYPE[lookup.filetype],
            name: lookup.filename,
            path: localPath,
            last_modified: data.date_modified,
            created: data.creation_time,
        };
        const model = Private.convertToJupyterApi(convOptions);
        Private.validateContentsModel(model);
        this._fileChanged.emit({
            type: 'save',
            oldValue: null,
            newValue: model
        });
        return model;
    }
    /**
     * Copy a file into a given directory.
     *
     * @param localPath - The original file path.
     *
     * @param toDir - The destination directory path.
     *
     * @returns A promise which resolves with the new contents model when the
     *  file is copied.
     *
     * #### Notes
     * The server will select the name of the copied file.
     *
     * Uses the [Jupyter Notebook API](https://petstore.swagger.io/?url=https://raw.githubusercontent.com/jupyter-server/jupyter_server/main/jupyter_server/services/api/api.yaml#!/contents) and validates the response model.
     */
    async copy(fromFile, toDir) {
        const url = this._getUrl(toDir);
        const init = {
            method: 'POST',
            body: JSON.stringify({ copy_from: fromFile })
        };
        const response = await ServerConnection.makeRequest(this.serverSettings, url, init);
        if (response.status !== 201) {
            const err = await ServerConnection.ResponseError.create(response);
            throw err;
        }
        const data = await response.json();
        Private.validateContentsModel(data);
        this._fileChanged.emit({
            type: 'new',
            oldValue: null,
            newValue: data
        });
        return data;
    }
    /**
     * Create a checkpoint for a file. Disabled for now.
     *
     * @param localPath - The path of the file.
     *
     * @returns A promise which resolves with the new checkpoint model when the
     *   checkpoint is created.
     *
     * #### Notes
     * Uses the [Jupyter Notebook API](https://petstore.swagger.io/?url=https://raw.githubusercontent.com/jupyter-server/jupyter_server/main/jupyter_server/services/api/api.yaml#!/contents) and validates the response model.
     */
    async createCheckpoint(localPath) {
        // const url = this._getUrl(localPath, 'checkpoints');
        // const init = { method: 'POST' };
        // const response = await ServerConnection.makeRequest(
        //   url,
        //   init,
        //   this.serverSettings
        // );
        // if (response.status !== 201) {
        //   const err = await ServerConnection.ResponseError.create(response);
        //   throw err;
        // }
        // const data = await response.json();
        // Private.validateCheckpointModel(data);
        // return data;
        return {
            id: 'no-op',
            last_modified: new Date().toISOString()
        };
    }
    /**
     * List available checkpoints for a file. Disabled for now.
     *
     * @param localPath - The path of the file.
     *
     * @returns A promise which resolves with a list of checkpoint models for
     *    the file.
     *
     * #### Notes
     * Uses the [Jupyter Notebook API](https://petstore.swagger.io/?url=https://raw.githubusercontent.com/jupyter-server/jupyter_server/main/jupyter_server/services/api/api.yaml#!/contents) and validates the response model.
     */
    async listCheckpoints(localPath) {
        // const url = this._getUrl(localPath, 'checkpoints');
        // const response = await ServerConnection.makeRequest(
        //   url,
        //   {},
        //   this.serverSettings
        // );
        // if (response.status !== 200) {
        //   const err = await ServerConnection.ResponseError.create(response);
        //   throw err;
        // }
        // const data = await response.json();
        // if (!Array.isArray(data)) {
        //   throw new Error('Invalid Checkpoint list');
        // }
        // for (let i = 0; i < data.length; i++) {
        //   Private.validateCheckpointModel(data[i]);
        // }
        // return data;
        return [];
    }
    /**
     * Restore a file to a known checkpoint state.  Disabled for now.
     *
     * @param localPath - The path of the file.
     *
     * @param checkpointID - The id of the checkpoint to restore.
     *
     * @returns A promise which resolves when the checkpoint is restored.
     *
     * #### Notes
     * Uses the [Jupyter Notebook API](https://petstore.swagger.io/?url=https://raw.githubusercontent.com/jupyter-server/jupyter_server/main/jupyter_server/services/api/api.yaml#!/contents).
     */
    async restoreCheckpoint(localPath, checkpointID) {
        // const url = this._getUrl(localPath, 'checkpoints', checkpointID);
        // const init = { method: 'POST' };
        // const response = await ServerConnection.makeRequest(
        //   url,
        //   init,
        //   this.serverSettings
        // );
        // if (response.status !== 204) {
        //   const err = await ServerConnection.ResponseError.create(response);
        //   throw err;
        // }
    }
    /**
     * Delete a checkpoint for a file. Disabled for now.
     *
     * @param localPath - The path of the file.
     *
     * @param checkpointID - The id of the checkpoint to delete.
     *
     * @returns A promise which resolves when the checkpoint is deleted.
     *
     * #### Notes
     * Uses the [Jupyter Notebook API](https://petstore.swagger.io/?url=https://raw.githubusercontent.com/jupyter-server/jupyter_server/main/jupyter_server/services/api/api.yaml#!/contents).
     */
    async deleteCheckpoint(localPath, checkpointID) {
        // const url = this._getUrl(localPath, 'checkpoints', checkpointID);
        // const init = { method: 'DELETE' };
        // const response = await ServerConnection.makeRequest(
        //   url,
        //   init,
        //   this.serverSettings
        // );
        // if (response.status !== 204) {
        //   const err = await ServerConnection.ResponseError.create(response);
        //   throw err;
        // }
    }
    /**
     * Get a REST url for a file given a path.
     */
    _getUrl(...args) {
        const parts = args.map(path => URLExt.encodeParts(path));
        const baseUrl = this.serverSettings.baseUrl;
        if (!baseUrl) {
            throw new Error('Jupyter server URL not set');
        }
        return URLExt.join(baseUrl, this._apiEndpoint, ...parts);
    }
    async refreshBrowser() {
        // Use the tracker to find the file browser for this drive
        const fileBrowser = this.browser.tracker.find((widget) => widget.model.driveName === this.name);
        if (fileBrowser) {
            await fileBrowser.model.refresh(); // Refresh the file browser model
        }
        else {
            console.warn(`No file browser found for drive: ${this.name}`);
        }
    }
    _apiEndpoint;
    _isDisposed = false;
    _fileChanged = new Signal(this);
}
/**
 * A namespace for module private data.
 */
var Private;
(function (Private) {
    /**
     * Normalize a file extension to be of the type `'.foo'`.
     *
     * Adds a leading dot if not present and converts to lower case.
     */
    function normalizeExtension(extension) {
        if (extension.length > 0 && extension.indexOf('.') !== 0) {
            extension = `.${extension}`;
        }
        return extension;
    }
    Private.normalizeExtension = normalizeExtension;
    /**
     * Validate a property as being on an object, and optionally
     * of a given type and among a given set of values.
     */
    function validateProperty(
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    object, name, typeName, values = []) {
        if (!object.hasOwnProperty(name)) {
            throw Error(`Missing property '${name}'`);
        }
        const value = object[name];
        if (typeName !== void 0) {
            let valid = true;
            switch (typeName) {
                case 'array':
                    valid = Array.isArray(value);
                    break;
                case 'object':
                    valid = typeof value !== 'undefined';
                    break;
                default:
                    valid = typeof value === typeName;
            }
            if (!valid) {
                throw new Error(`Property '${name}' is not of type '${typeName}'`);
            }
            if (values.length > 0) {
                let valid = true;
                switch (typeName) {
                    case 'string':
                    case 'number':
                    case 'boolean':
                        valid = values.includes(value);
                        break;
                    default:
                        valid = values.findIndex(v => v === value) >= 0;
                        break;
                }
                if (!valid) {
                    throw new Error(`Property '${name}' is not one of the valid values ${JSON.stringify(values)}`);
                }
            }
        }
    }
    Private.validateProperty = validateProperty;
    function validateContentsModel(model) {
        validateProperty(model, 'name', 'string');
        validateProperty(model, 'path', 'string');
        validateProperty(model, 'type', 'string');
        validateProperty(model, 'created', 'string');
        validateProperty(model, 'last_modified', 'string');
        validateProperty(model, 'mimetype', 'object');
        validateProperty(model, 'content', 'object');
        validateProperty(model, 'format', 'object');
    }
    Private.validateContentsModel = validateContentsModel;
    /**
     * Validate an `Contents.ICheckpointModel` object.
     */
    function validateCheckpointModel(model) {
        validateProperty(model, 'id', 'string');
        validateProperty(model, 'last_modified', 'string');
    }
    Private.validateCheckpointModel = validateCheckpointModel;
    function transformItem(item, localPath) {
        if (!item) {
            throw new Error("Item is missing or undefined.");
        }
        const itemType = FILETYPE_TO_TYPE[item.filetype] || "file";
        const mimetype = FILETYPE_TO_MIMETYPE[item.filetype || ""] || null;
        const newLocalPath = localPath ? `${localPath}/${item.filename}` : item.filename;
        return {
            name: item.filename || "",
            path: newLocalPath,
            last_modified: item.date_modified,
            created: item.creation_time,
            content: null,
            format: null,
            mimetype,
            size: null,
            writable: true,
            hash: null,
            hash_algorithm: null,
            type: itemType,
        };
    }
    // export function convertToJupyterApi(plotlyObject: any, fileType: string | undefined, fileName: string | null, action: string, localPath: string, lookup: any ): any {
    function convertToJupyterApi(convOptions) {
        // console.log('convertToJupyterApi start', convOptions);
        const { data, type, name, path, created, last_modified } = convOptions;
        const mimetype = TYPE_TO_MIMETYPE[type || ""] || null;
        let format = TYPE_TO_FORMAT[type || ""] || null;
        let transformedData = data?.children ? (data.children?.results || []).map((item) => transformItem(item, path)) : data;
        const model = {
            name,
            path,
            last_modified,
            created,
            content: transformedData,
            format,
            mimetype,
            size: null,
            writable: true,
            hash: null,
            hash_algorithm: null,
            type,
        };
        // console.log('convertToJupyterApi end', model);
        return model;
    }
    Private.convertToJupyterApi = convertToJupyterApi;
})(Private || (Private = {}));
