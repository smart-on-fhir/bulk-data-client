/*
Usage:
  typedoc path/to/entry.ts

Supported highlighting themes:
css-variables       dark-plus           dracula-soft        dracula             
github-dark-dimmed  github-dark         github-light        light-plus          
material-darker     material-default    material-lighter    material-ocean      
material-palenight  min-dark            min-light           monokai             
nord                one-dark-pro        poimandres          slack-dark          
slack-ochin         solarized-dark      solarized-light     vitesse-dark        
vitesse-light
*/
module.exports = {

    // Specifies whether categorization will be done at the group level.
    // --categorizeByGroup
    categorizeByGroup: false,

    // Specifies the order in which categories appear. * indicates the relative
    // order for categories not in the list.
    // --categoryOrder
    categoryOrder: "*",

    // If set, TypeDoc will remove the output directory before writing output.
    // --cleanOutputDir
    cleanOutputDir: true,

    // Path to a custom CSS file to for the theme to import.
    // --customCss
    // customCss: "",

    // Specifies the code highlighting theme in dark mode.
    // --darkHighlightTheme
    // darkHighlightTheme: ""

    //  --defaultCategory           Specifies the default category for reflections without a category.

    // Disables setting the source of a reflection when documenting it.
    // --disableSources
    disableSources: false,

    //  --emit                      If set, TypeDoc will emit the TypeScript compilation result

    // Specifies the entry points to be documented by TypeDoc. TypeDoc will
    // examine the exports of these files and create documentation according
    // to the exports. Either files or directories may be specified. If a
    // directory is specified, all source files within the directory will be
    // included as an entry point, unless excluded by --exclude.
    //  --entryPoints
    entryPoints: [
        // "./index.d.ts",
        "./src/"
    ],
    //  --entryPointStrategy        The strategy to be used to convert entry points into documentation modules.
    //  --exclude                   Define patterns to be excluded when expanding a directory that was specified as an entry point.
    //  --excludeExternals          Prevent externally resolved symbols from being documented.
    //  --excludeInternal           Prevent symbols that are marked with @internal from being documented.
    //  --excludeNotDocumented      Prevent symbols that are not explicitly documented from appearing in the results.

    // Ignores private variables and methods
    //  --excludePrivate
    excludePrivate: false,

    // Ignores protected variables and methods
    // --excludeProtected
    excludeProtected: false,

    //  --excludeTags               Remove the listed tags from doc comments.
    //  --externalPattern           Define patterns for files that should be considered being external.
    //  --gaID                      Set the Google Analytics tracking ID and activate tracking code.
    //  --gaSite                    Set the site name for Google Analytics. Defaults to `auto`.

    // Use the specified remote for linking to GitHub source files.
    // --gitRemote
    gitRemote: "https://github.com/smart-on-fhir/bulk-data-client",

    //  --gitRevision               Use specified revision instead of the last revision for linking to GitHub source files.
    
    //  --help                      Print this message.
    //  --hideGenerator             Do not print the TypeDoc link at the end of the page.
    //  --hideLegend                Do not print the Legend for icons at the end of the page.
    
    // Specifies the location to look for included documents
    // (use [[include:FILENAME]] in comments).
    // --includes DIRECTORY
    includes: "./docs",

    //  --includeVersion            Add the package version to the project name.
    //  --intentionallyNotExported  A list of types which should not produce 'referenced but not documented' warnings.
    //  --json                      Specifies the location and filename a JSON file describing the project is written to.
    //  --lightHighlightTheme       Specifies the code highlighting theme in light mode.
    //  --listInvalidSymbolLinks    Emits a list of broken symbol {@link navigation} links after documentation generation, DEPRECATED, prefer validation.invalidLink instead.
    //  --logger                    Specify the logger that should be used, 'none' or 'console'
    //  --logLevel                  Specify what level of logging should be used.
    //  --markedOptions             Specify the options passed to Marked, the Markdown parser used by TypeDoc
    //  --media                     Specifies the location with media files that should be copied to the output directory.

    // Set the name of the project that will be used in the header of the
    // template.
    // --name
    name: "Bulk Data Client",

    //  --options                   Specify a json option file that should be loaded. If not specified TypeDoc will look for 'typedoc.json' in the current directory

    // Specifies the location the documentation should be written to.
    // --out
    out: "./docs/api",

    //  --plugin                    Specify the npm plugins that should be loaded. Omit to load all installed plugins, set to 'none' to load no plugins.

    // If set, TypeDoc will not clear the screen between compilation runs.
    // --preserveWatchOutput
    preserveWatchOutput: true,

    //  --pretty                    Specifies whether the output JSON should be formatted with tabs.

    // Path to the readme file that should be displayed on the index page. Pass
    // `none` to disable the index page and start the documentation on the
    // globals page.
    // --readme
    readme: "../README.md",

    //  --showConfig                Print the resolved configuration and exit
    //  --sort                      Specify the sort strategy for documented values
    //  --theme                     Specify the path to the theme that should be used, or 'default' or 'minimal' to use built-in themes.Note: Not resolved according to the config file location, always resolved according to cwd.
    //  --treatWarningsAsErrors     If set, warnings will be treated as errors.
    //  --tsconfig                  Specify a TypeScript config file that should be loaded. If not specified TypeDoc will look for 'tsconfig.json' in the current directory.
    //  --validation                Specify which validation steps TypeDoc should perform on your generated documentation.
    //  --version                   Print TypeDoc's version.
    //  --watch                     Watch files for changes and rebuild docs on change.

};