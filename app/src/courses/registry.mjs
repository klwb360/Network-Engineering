import httpCache from './http-cache.mjs';
import {assertCourse} from '../authoring/validate.mjs';

// Add one descriptor import and one entry here for each new course.
// Upstream lessons remain in the pinned production snapshot.
export const customCourses = [httpCache];
let installed = false;

export function registerCourses({lessons,navigation,capabilities}, descriptors) {
  const ids = new Set(Object.keys(lessons));
  const navIds = new Set(navigation.map(item=>item.id));
  const translatedValues=new Map();
  const additions = [];
  // Validate the complete batch before mutating either upstream registry.
  for (const descriptor of descriptors) {
    assertCourse(descriptor,capabilities);
    const id=descriptor.lesson.id;
    if (ids.has(id)||navIds.has(id)) throw Error(`Duplicate course id: ${id}`);
    for (const [language,locale] of Object.entries(descriptor.translations??{})) {
      for (const [key,value] of Object.entries(locale.strings??{})) {
        const token=`${language}\0${key}`;
        if(translatedValues.has(token)&&translatedValues.get(token)!==value)throw Error(`Conflicting course translation (${language}): ${key}`);
        translatedValues.set(token,value);
      }
    }
    ids.add(id); navIds.add(id); additions.push(descriptor);
  }
  for (const descriptor of additions) {
    lessons[descriptor.lesson.id]=descriptor.lesson;
    navigation.push(descriptor.navigation);
  }
  return additions.length;
}

export function installCourses(runtime) {
  if (installed) throw Error('Courses must be registered exactly once before app boot');
  registerCourses(runtime,customCourses);
  installed=true;
}

export function translateCourseText(text,language) {
  for (const descriptor of customCourses) {
    const value=descriptor.translations?.[language]?.strings?.[text];
    if (value!==undefined) return value;
  }
  // Untranslated course text follows the upstream English fallback.
  return undefined;
}
