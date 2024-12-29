import { ServerConnection } from './serverconnection';
import { Signal } from '@lumino/signaling';
import { URLExt } from '@jupyterlab/coreutils';
/**
 * The url for the default drive service.
 */
const SERVICE_DRIVE_URL = 'v2/';
/**
 * The url for the file access.
 */
const FILES_URL = 'files';
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
    constructor(options = {}) {
        this._isDisposed = false;
        this._fileChanged = new Signal(this);
        this.name = options.name ?? 'Default';
        this._apiEndpoint = options.apiEndpoint ?? SERVICE_DRIVE_URL;
        this.serverSettings =
            options.serverSettings ?? ServerConnection.makeSettings();
    }
    /**
     * A signal emitted when a file operation takes place.
     */
    get fileChanged() {
        return this._fileChanged;
    }
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
        const response = await ServerConnection.makeRequest(url, {}, this.serverSettings, params);
        if (response.status !== 200) {
            const err = await ServerConnection.ResponseError.create(response);
            throw err;
        }
        let data = await response.json();
        return data;
    }
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
        console.log('get', localPath, options);
        let filetype = 'fold';
        let lookup;
        let filename = '';
        let pathParts = [];
        let params = {};
        // We need to do a lookup first to determine the appropriate api path
        if (localPath) {
            // Get the filetype and filename from the lookup
            lookup = await this.lookup(localPath);
            filetype = lookup.filetype;
            filename = lookup.filename;
            if (filetype === 'fold') {
                pathParts.push('folders');
                pathParts.push(lookup.fid);
                params = { page: 1, page_size: 100000, order_by: 'filename' };
            }
            else if (filetype === 'jupyter_notebook') {
                pathParts.push('jupyter-notebooks');
                pathParts.push(lookup.fid);
                pathParts.push('content');
            }
        }
        else { // For home directory we do not need to do a lookup  
            pathParts.push('folders');
            pathParts.push('home');
            params = { page: 1, page_size: 100000, order_by: 'filename' };
        }
        const url = this._getUrl(...pathParts);
        if (options) {
            // The notebook type cannot take a format option.
            if (options.type === 'notebook') {
                delete options['format'];
            }
            const content = options.content ? '1' : '0';
            params = { ...params, ...options, content };
        }
        const settings = this.serverSettings;
        const response = await ServerConnection.makeRequest(url, {}, settings, params);
        if (response.status !== 200) {
            const err = await ServerConnection.ResponseError.create(response);
            throw err;
        }
        let data = await response.json();
        let jupyterData = data;
        try {
            jupyterData = Private.convertToJupyterApi(data, FILETYPE_TO_TYPE[filetype], filename, 'get');
        }
        catch (error) {
            console.error('Error converting to Jupyter API', error);
        }
        console.log(data);
        console.log(jupyterData);
        Private.validateContentsModel(jupyterData);
        return jupyterData;
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
        console.log('newUntitled options', options);
        let args = [];
        let body;
        let headers;
        let fileName = null;
        if (options.type === 'notebook') {
            console.log('newUntitled notebook');
            fileName = 'Untitled notebook.ipynb';
            args.push('jupyter-notebooks');
            args.push('upload');
            body = JSON.stringify({
                "cells": [],
                "metadata": {},
                "nbformat": 4,
                "nbformat_minor": 5
            });
            headers = {
                'plotly-client-platform': 'web - jupyterlite',
                'plotly-parent': '-1',
                'plotly-world-readable': 'false',
                'x-file-name': fileName,
                'content-type': 'application/json',
            };
        }
        else if (options.type === 'directory') {
            console.log('newUntitled directory');
            fileName = 'Unnamed Folder';
            args.push('folders');
            let parent;
            if (!options.path) {
                parent = -1;
            }
            else {
                const lookup = await this.lookup(options.path);
                const fid = lookup.fid;
                const idlocal = fid.split(':')[1];
                parent = idlocal;
            }
            body = JSON.stringify({
                "parent": parent,
                "path": "Unnamed Folder",
            });
            headers = {
                'plotly-client-platform': 'web - jupyterlite',
                'content-type': 'application/json',
            };
        }
        const settings = this.serverSettings;
        const url = this._getUrl(...args);
        const init = {
            method: 'POST',
            body,
            headers,
        };
        const response = await ServerConnection.makeRequest(url, init, settings);
        if (response.status !== 201) {
            const err = await ServerConnection.ResponseError.create(response);
            throw err;
        }
        const data = await response.json();
        // Transform the API response to a Contents.IModel
        console.log('newUntitled data', data);
        const model = Private.convertToJupyterApi(data, options.type, fileName, 'newUntitled');
        console.log('newUntitled model', model);
        Private.validateContentsModel(model);
        this._fileChanged.emit({
            type: 'new',
            oldValue: null,
            newValue: model
        });
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
        const url = this._getUrl(localPath);
        const settings = this.serverSettings;
        const init = { method: 'DELETE' };
        const response = await ServerConnection.makeRequest(url, init, settings);
        // TODO: update IPEP27 to specify errors more precisely, so
        // that error types can be detected here with certainty.
        if (response.status !== 204) {
            const err = await ServerConnection.ResponseError.create(response);
            throw err;
        }
        this._fileChanged.emit({
            type: 'delete',
            oldValue: { path: localPath },
            newValue: null
        });
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
        const settings = this.serverSettings;
        const lookup = await this.lookup(oldLocalPath);
        let pathParts = [];
        pathParts.push('files');
        pathParts.push(lookup.fid);
        const url = this._getUrl(...pathParts);
        lookup.filename = newLocalPath;
        const headers = {
            'plotly-client-platform': 'web - jupyterlite',
            'content-type': 'application/json',
        };
        const init = {
            method: 'PATCH',
            body: JSON.stringify(lookup),
            headers,
        };
        const response = await ServerConnection.makeRequest(url, init, settings);
        if (response.status !== 200) {
            const err = await ServerConnection.ResponseError.create(response);
            throw err;
        }
        const data = await response.json();
        let model;
        try {
            model = Private.convertToJupyterApi(data, FILETYPE_TO_TYPE[lookup.filetype], newLocalPath, 'rename');
            Private.validateContentsModel(model);
            console.log('rename model', model);
        }
        catch (error) {
            console.error('Error converting to Jupyter API', error);
        }
        this._fileChanged.emit({
            type: 'rename',
            oldValue: { path: oldLocalPath },
            newValue: model
        });
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
        const settings = this.serverSettings;
        const url = this._getUrl(localPath);
        const init = {
            method: 'PUT',
            body: JSON.stringify(options)
        };
        const response = await ServerConnection.makeRequest(url, init, settings);
        // will return 200 for an existing file and 201 for a new file
        if (response.status !== 200 && response.status !== 201) {
            const err = await ServerConnection.ResponseError.create(response);
            throw err;
        }
        const data = await response.json();
        Private.validateContentsModel(data);
        this._fileChanged.emit({
            type: 'save',
            oldValue: null,
            newValue: data
        });
        return data;
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
        const settings = this.serverSettings;
        const url = this._getUrl(toDir);
        const init = {
            method: 'POST',
            body: JSON.stringify({ copy_from: fromFile })
        };
        const response = await ServerConnection.makeRequest(url, init, settings);
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
    function transformItem(item) {
        if (!item) {
            throw new Error("Item is missing or undefined.");
        }
        const itemType = FILETYPE_TO_TYPE[item.filetype] || "file";
        const mimetype = FILETYPE_TO_MIMETYPE[item.filetype || ""] || null;
        return {
            name: item.filename || "",
            path: item.filename || "",
            last_modified: item.date_modified || new Date().toISOString(),
            created: item.creation_time || new Date().toISOString(),
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
    function convertToJupyterApi(plotlyObject, fileType, fileName, action) {
        const data = plotlyObject?.file ? plotlyObject.file : plotlyObject;
        console.log('convertToJupyterApi', data, fileType, fileName);
        let transformedContent;
        let name;
        let mimetype;
        let format;
        if (fileType === 'directory' && action === 'get') {
            if (!data?.children?.results) {
                throw new Error("No children found for directory-type data.");
            }
            transformedContent = (data.children?.results || []).map(transformItem);
            name = '';
            mimetype = null;
            format = 'json';
        }
        else if (fileType === 'directory') {
            transformedContent = null;
            name = fileName;
            mimetype = TYPE_TO_MIMETYPE[fileType || ""] || null;
            format = null;
        }
        else {
            transformedContent = data;
            name = fileName;
            mimetype = TYPE_TO_MIMETYPE[fileType || ""] || null;
            format = 'json';
        }
        return {
            name,
            path: "",
            last_modified: new Date().toISOString(),
            created: new Date().toISOString(),
            content: transformedContent,
            format,
            mimetype,
            size: null,
            writable: true,
            hash: null,
            hash_algorithm: null,
            type: fileType,
        };
    }
    Private.convertToJupyterApi = convertToJupyterApi;
})(Private || (Private = {}));
