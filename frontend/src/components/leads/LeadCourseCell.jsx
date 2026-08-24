import { useMutation, useQueryClient } from '@tanstack/react-query'
import { leadService } from '@/services/leadService'
import { getApiErrorMessage } from '@/services/apiClient'
import { InlineSelectCell } from '@/components/leads/InlineSelectCell'

// What the column stores.
const MAX_COURSE = 150

/**
 * The course a lead is on, changed from the table.
 *
 * It was plain text, so moving somebody between courses meant the detail
 * modal - and the course is the field a sales call most often ends by
 * changing.
 *
 * The list is the live programs, so a course nobody is on yet can still be
 * picked; anything already in the data that is no longer a program follows
 * them, or a lead recorded before a rename would show a course its own
 * dropdown denies. Typing a new one is deliberately off: the board filters and
 * the analytics both group on this string, and one typo splits a course in two
 * everywhere it is counted.
 */
export function LeadCourseCell({ lead, options, onError }) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (course_interest) => leadService.update(lead.id, { course_interest }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
    onError: (error) => onError?.(`Couldn't change the course for ${lead.name}: ${getApiErrorMessage(error)}`),
  })

  return (
    <InlineSelectCell
      value={lead.course_interest}
      groups={[{ key: 'courses', options }]}
      allowCustom={false}
      badgeClass="border-slate-200 bg-slate-50 text-slate-700"
      placeholder="Set course"
      clearLabel="No course"
      searchLabel="Search courses"
      maxLength={MAX_COURSE}
      isSaving={mutation.isPending}
      onSave={(value) => mutation.mutate(value)}
    />
  )
}
