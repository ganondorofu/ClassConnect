
"use client";

import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Subject } from '@/models/subject';

const SUBJECT_SELECTOR_NONE_VALUE = "___SUBJECT_SELECTOR_NONE___";

interface SubjectSelectorProps {
  subjects: Subject[];
  selectedSubjectId: string | null; 
  onValueChange: (subjectId: string | null) => void; 
  placeholder?: string; 
  disabled?: boolean;
  className?: string;
}

export function SubjectSelector({
  subjects,
  selectedSubjectId,
  onValueChange,
  placeholder = "科目を選択", 
  disabled = false,
  className,
}: SubjectSelectorProps) {

  const handleValueChange = (value: string) => {
    onValueChange(value === SUBJECT_SELECTOR_NONE_VALUE ? null : value);
  };
  
  const selectValue = selectedSubjectId === null ? SUBJECT_SELECTOR_NONE_VALUE : selectedSubjectId;

  return (
    <Select
      value={selectValue ?? SUBJECT_SELECTOR_NONE_VALUE} 
      onValueChange={handleValueChange}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SUBJECT_SELECTOR_NONE_VALUE}>
          <span className="text-muted-foreground">科目未設定 (なし)</span>
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
