import { FormGroup } from '@angular/forms';

export function isFormFieldInvalid(form: FormGroup, field: string): boolean {
  const ctrl = form.get(field);
  return !!(ctrl?.invalid && ctrl?.touched);
}
