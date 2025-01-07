from notebook.services.contents.filemanager import FileContentsManager
from http.cookies import SimpleCookie
import os


class UserContentsManager(FileContentsManager):
    def get_username_from_cookie(self, request):
        cookie_header = request.headers.get("Cookie", "")
        cookies = SimpleCookie(cookie_header)
        return (
            cookies.get("JUPYTERHUB_USER").value
            if "JUPYTERHUB_USER" in cookies
            else "test"
        )

    def get_root_dir(self, request):
        username = self.get_username_from_cookie(request)
        if not username:
            raise PermissionError("Missing username. Unable to set root directory.")
        root_dir = f"/jupyterlab/{username}"
        os.makedirs(root_dir, exist_ok=True)
        return root_dir

    def _get_os_path(self, path):
        request = self.request
        root_dir = self.get_root_dir(request)
        os_path = os.path.join(root_dir, path.strip("/"))
        return os_path
