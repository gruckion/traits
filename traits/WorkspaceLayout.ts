/** The workspace directory holding traits configuration, trait files, and environments, relative to the workspace root. */
export const directory = ".agents/traits"

/** The workspace configuration file; the underscore sorts it before trait files. */
export const config = `${directory}/_traits.json`

/** Named environment configurations; the underscore sorts them before trait files. */
export const environments = `${directory}/_environments`

/** The file defining the named trait. */
export const traitFile = (name: string) => `${directory}/${name}.md`

/** The file defining the named environment. */
export const environmentFile = (name: string) => `${environments}/${name}.json`
