import { Contents } from '@jupyterlab/services';
import { ServerConnection } from './serverconnection';
import { ISignal } from '@lumino/signaling';
/**
 * A namespace for Drive statics.
 */
export declare namespace Drive {
    /**
     * The options used to initialize a `Drive`.
     */
    interface IOptions {
        /**
         * The name for the `Drive`, which is used in file
         * paths to disambiguate it from other drives.
         */
        name?: string;
        /**
         * The server settings for the server.
         */
        serverSettings?: ServerConnection.ISettings;
        /**
         * A REST endpoint for drive requests.
         * If not given, defaults to the Jupyter
         * REST API given by [Jupyter Notebook API](https://petstore.swagger.io/?url=https://raw.githubusercontent.com/jupyter-server/jupyter_server/main/jupyter_server/services/api/api.yaml#!/contents).
         */
        apiEndpoint?: string;
    }
}
/**
 * A default implementation for an `IDrive`, talking to the
 * server using the Jupyter REST API.
 */
export declare class Drive implements Contents.IDrive {
    /**
     * Construct a new contents manager object.
     *
     * @param options - The options used to initialize the object.
     */
    constructor(options?: Drive.IOptions);
    /**
     * The name of the drive, which is used at the leading
     * component of file paths.
     */
    readonly name: string;
    /**
     * A signal emitted when a file operation takes place.
     */
    get fileChanged(): ISignal<this, Contents.IChangedArgs>;
    /**
     * The server settings of the drive.
     */
    serverSettings: ServerConnection.ISettings;
    /**
     * Test whether the manager has been disposed.
     */
    get isDisposed(): boolean;
    /**
     * Dispose of the resources held by the manager.
     */
    dispose(): void;
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
    get(localPath: string, options?: Contents.IFetchOptions): Promise<Contents.IModel>;
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
    getDownloadUrl(localPath: string): Promise<string>;
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
    newUntitled(options?: Contents.ICreateOptions): Promise<Contents.IModel>;
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
    delete(localPath: string): Promise<void>;
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
    rename(oldLocalPath: string, newLocalPath: string): Promise<Contents.IModel>;
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
    save(localPath: string, options?: Partial<Contents.IModel>): Promise<Contents.IModel>;
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
    copy(fromFile: string, toDir: string): Promise<Contents.IModel>;
    /**
     * Create a checkpoint for a file.
     *
     * @param localPath - The path of the file.
     *
     * @returns A promise which resolves with the new checkpoint model when the
     *   checkpoint is created.
     *
     * #### Notes
     * Uses the [Jupyter Notebook API](https://petstore.swagger.io/?url=https://raw.githubusercontent.com/jupyter-server/jupyter_server/main/jupyter_server/services/api/api.yaml#!/contents) and validates the response model.
     */
    createCheckpoint(localPath: string): Promise<Contents.ICheckpointModel>;
    /**
     * List available checkpoints for a file.
     *
     * @param localPath - The path of the file.
     *
     * @returns A promise which resolves with a list of checkpoint models for
     *    the file.
     *
     * #### Notes
     * Uses the [Jupyter Notebook API](https://petstore.swagger.io/?url=https://raw.githubusercontent.com/jupyter-server/jupyter_server/main/jupyter_server/services/api/api.yaml#!/contents) and validates the response model.
     */
    listCheckpoints(localPath: string): Promise<Contents.ICheckpointModel[]>;
    /**
     * Restore a file to a known checkpoint state.
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
    restoreCheckpoint(localPath: string, checkpointID: string): Promise<void>;
    /**
     * Delete a checkpoint for a file.
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
    deleteCheckpoint(localPath: string, checkpointID: string): Promise<void>;
    /**
     * Get a REST url for a file given a path.
     */
    private _getUrl;
    private _apiEndpoint;
    private _isDisposed;
    private _fileChanged;
}
