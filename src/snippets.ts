const ORIGIN = window.parent.location.origin;

export const SNIPPETS = {
  installChartStudio: `# Patch http requests (required for importing data into Python execution environment)
import pyodide_http
pyodide_http.patch_all()

# Install Chart Studio package to interact with Figlinq datasets and charts
%pip install chart_studio

# Import required libraries
import chart_studio

# Set credentials and privacy settings
chart_studio.tools.set_config_file(
    plotly_domain='${ORIGIN}',
    plotly_api_domain='${ORIGIN}',
    world_readable=False,
    sharing='private'
)

# To generate/view your API key, visit ${ORIGIN}/settings/api
chart_studio.tools.set_credentials_file(username='YOUR_USERNAME', api_key='YOUR_API_KEY')

# Create traces
trace0 = go.Scatter(
    x=[1, 2, 3, 4],
    y=[10, 15, 13, 17]
)
trace1 = go.Scatter(
    x=[1, 2, 3, 4],
    y=[16, 5, 11, 9]
)
data = [trace0, trace1]

# Set some basic plot styling
layout=go.Layout(
    width=400,
    height=360,
    autosize=False,
    plot_bgcolor='white',
    title=dict(
        text='Example Plot with Custom Styling',
    ),
    xaxis=dict(
        title='X Axis',
    ),
    yaxis=dict(
        title='Y Axis',
    ),
)

# Create plot and save to Figlinq
fig = go.Figure(data=data, layout=layout)
py.plot(fig, filename = 'Simple line chart')
`,
  patchHttp: `# Patch http requests (required for importing data into Python execution environment)
import pyodide_http
pyodide_http.patch_all()`
}