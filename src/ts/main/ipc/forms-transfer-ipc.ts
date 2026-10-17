// Recovered f3949-f3953. Dialog selection and import accounting are kept in
// their original order; notably pasted parsing errors abort the whole request,
// while a file parsing error skips that file and individual model errors skip
// just that model. No live provider calls are involved.
export interface FormModel {
  label?: string;
  journey: {origin?: unknown; destination?: unknown};
  [key: string]: unknown;
}
interface Result {ok: boolean; data?: unknown; error?: unknown}
interface Event {sender: unknown}
interface Pick {canceled: boolean; filePaths: string[]}
interface SavePick {canceled: boolean; filePath?: string}
interface SaveOptions {defaultPath: string; filters: {name: string; extensions: string[]}[]}
interface OpenOptions {properties: string[]; filters: {name: string; extensions: string[]}[]}
export interface FormsTransferDeps {
  windowFor(sender: unknown): unknown;
  saveDialog(parent: unknown, options: SaveOptions): Promise<SavePick>;
  saveDialogWithoutParent(options: SaveOptions): Promise<SavePick>;
  openDialog(parent: unknown, options: OpenOptions): Promise<Pick>;
  openDialogWithoutParent(options: OpenOptions): Promise<Pick>;
  fs(): {readFileSync(path: string, encoding: 'utf8'): string; writeFileSync(path: string, data: string | undefined, encoding: 'utf8'): void};
  basename(path: string): string;
  formsVault(): {get(id: unknown): FormModel | null | undefined; saveMany(models: FormModel[]): unknown[]};
  parseForms(name: string, text: string): unknown[];
  normalize(model: unknown, id: string, now: number): FormModel;
  serialize(model: FormModel): unknown;
  changed(): void;
  uuid(): string;
  now(): number;
}
const failed = (error: unknown): Result => ({ok: false, error: (error as {message?: unknown}).message});
function exportName(model: FormModel): string {
  const name = model.label || (model.journey.origin + '-' + model.journey.destination) || 'form';
  return (name.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 60) || 'form') + '.json';
}
async function saveModel(deps: FormsTransferDeps, event: Event, model: FormModel): Promise<Result> {
  const parent = deps.windowFor(event.sender) ?? undefined;
  const options = {defaultPath: exportName(model), filters: [{name: 'JSON', extensions: ['json']}]};
  const picked = await (parent ? deps.saveDialog(parent, options) : deps.saveDialogWithoutParent(options));
  if (picked.canceled || !picked.filePath) return {ok: true, data: {canceled: true}};
  // fs is resolved before serialization, matching the recovered evaluation order.
  const fs = deps.fs();
  fs.writeFileSync(picked.filePath, JSON.stringify(deps.serialize(model), null, 2), 'utf8');
  return {ok: true, data: {}};
}
export async function exportForm(deps: FormsTransferDeps, event: Event, id: unknown): Promise<Result> {
  try {
    const model = deps.formsVault().get(id);
    return model ? await saveModel(deps, event, model) : {ok: false, error: 'Form not found'};
  } catch (error) {return failed(error);}
}
export async function exportFormModel(deps: FormsTransferDeps, event: Event, model: FormModel): Promise<Result> {
  try {return await saveModel(deps, event, model);} catch (error) {return failed(error);}
}
async function pickFiles(deps: FormsTransferDeps, event: Event, multiple: boolean): Promise<Pick> {
  const parent = deps.windowFor(event.sender) ?? undefined;
  const options = {properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: [{name: multiple ? 'Forms (CSV / JSON)' : 'JSON', extensions: multiple ? ['csv', 'json'] : ['json']}]};
  return parent ? deps.openDialog(parent, options) : deps.openDialogWithoutParent(options);
}
function appendModels(deps: FormsTransferDeps, models: unknown[], output: FormModel[]): number {
  let skipped = 0;
  for (const model of models) {
    try {output.push(deps.normalize(model, deps.uuid(), deps.now()));}
    catch {skipped++;}
  }
  return skipped;
}
export async function importForms(deps: FormsTransferDeps, event: Event): Promise<Result> {
  try {
    const picked = await pickFiles(deps, event, true);
    if (picked.canceled || picked.filePaths.length === 0) return {ok: true, data: {imported: 0, skipped: 0}};
    const vault = deps.formsVault(), output: FormModel[] = [];
    let skipped = 0;
    for (const file of picked.filePaths) {
      let models: unknown[] = [];
      try {models = deps.parseForms(deps.basename(file), deps.fs().readFileSync(file, 'utf8'));}
      catch {skipped++; continue;}
      if (models.length) skipped += appendModels(deps, models, output);
      else skipped++;
    }
    const imported = vault.saveMany(output).length;
    if (imported) deps.changed();
    return {ok: true, data: {imported, skipped}};
  } catch (error) {return failed(error);}
}
export async function importFormsData(deps: FormsTransferDeps, items: unknown): Promise<Result> {
  try {
    if (!Array.isArray(items)) return {ok: true, data: {imported: 0, skipped: 0}};
    const vault = deps.formsVault(), output: FormModel[] = [];
    let skipped = 0;
    for (const item of items.slice(0, 200) as ({name?: unknown; text?: unknown} | null | undefined)[]) {
      const name = typeof item?.name === 'string' ? item.name : '';
      const text = typeof item?.text === 'string' ? item.text : '';
      if (!text || text.length > 5242880) {skipped++; continue;}
      const models = deps.parseForms(name, text);
      if (models.length) skipped += appendModels(deps, models, output);
      else skipped++;
    }
    const imported = vault.saveMany(output).length;
    if (imported) deps.changed();
    return {ok: true, data: {imported, skipped}};
  } catch (error) {return failed(error);}
}
export async function importFormFile(deps: FormsTransferDeps, event: Event): Promise<Result> {
  try {
    const picked = await pickFiles(deps, event, false);
    if (picked.canceled || picked.filePaths.length === 0) return {ok: true, data: {canceled: true}};
    const parsed: unknown = JSON.parse(deps.fs().readFileSync(picked.filePaths[0], 'utf8'));
    return {ok: true, data: {model: deps.normalize(Array.isArray(parsed) ? parsed[0] : parsed, deps.uuid(), deps.now())}};
  } catch (error) {return failed(error);}
}
