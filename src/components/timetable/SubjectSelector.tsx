
"use client";

import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Subject } from '@/models/subject';

const SUBJECT_SELECTOR_NONE_VALUE = "___SUBJECT_SELECTOR_NONE___";
const SUBJECT_SELECTOR_UNSET_VALUE = "___SUBJECT_SELECTOR_UNSET___";

interface SubjectSelectorProps {
  subjects: Subject[];
  selectedSubjectId: string | null | undefined; 
  onValueChange: (subjectId: string | null | undefined) => void; 
  placeholder?: string; 
  disabled?: boolean;
  className?: string;
  includeUnsetOption?: boolean;
}

export function SubjectSelector({
  subjects,
  selectedSubjectId,
  onValueChange,
  placeholder = "科目を選択",
  disabled = false,
  className,
  includeUnsetOption = false,
}: SubjectSelectorProps) {

  const handleValueChange = (value: string) => {
    if (value === SUBJECT_SELECTOR_NONE_VALUE) {
      onValueChange(null);
    } else if (value === SUBJECT_SELECTOR_UNSET_VALUE) {
      onValueChange(undefined);
    } else {
      onValueChange(value);
    }
  };
  
  const getSelectValue = () => {
    if (selectedSubjectId === null) return SUBJECT_SELECTOR_NONE_VALUE;
    if (selectedSubjectId === undefined) return SUBJECT_SELECTOR_UNSET_VALUE;
    return selectedSubjectId;
  };

  return (
    <Select
      value={getSelectValue() ?? SUBJECT_SELECTOR_UNSET_VALUE} 
      onValueChange={handleValueChange}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeUnsetOption && (
           <SelectItem value={SUBJECT_SELECTOR_UNSET_VALUE}>
            <span className="text-muted-foreground italic">未設定</span>
          </SelectItem>
        )}
        <SelectItem value={SUBJECT_SELECTOR_NONE_VALUE}>
          <span className="text-muted-foreground">なし</span>
        </SelectItem>
        {subjects.map((subject) => (
          <SelectItem key={subject.id} value={subject.id!}>
            {subject.name} {subject.teacherName ? `(${subject.teacherName})` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
