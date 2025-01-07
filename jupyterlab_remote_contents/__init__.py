from ._version import __version__
from .contents_manager import UserContentsManager


def _jupyter_labextension_paths():
    return [{"src": "labextension", "dest": "jupyterlab-remote-contents"}]


def _jupyter_server_extension_paths():
    return [{"module": "jupyterlab_remote_contents"}]


def load_jupyter_server_extension(nb_app):
    nb_app.log.info("Enabling UserContentsManager")
    nb_app.web_app.settings["contents_manager_class"] = UserContentsManager
