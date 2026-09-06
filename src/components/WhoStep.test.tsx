import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Student } from '../api/types';
import WhoStep from './WhoStep';

const lunch = {
  supplierServiceKey: 'lunch',
  supplierServiceName: 'Lunch',
  supplierKey: 'canteen',
  supplierSiteKey: 'site',
  supplierSiteTimeRegionKey: 'melbourne',
};
const frenchDay = {
  ...lunch,
  supplierServiceKey: 'french',
  supplierServiceName: 'Junior School French Day ',
};

const student: Student = {
  studentKey: 'student-1',
  studentId: 1,
  isClassValid: true,
  studentFirstName: 'Sam',
  studentLastName: 'Example',
  schoolKey: 'school-1',
  schoolName: 'Example Grammar',
  schoolSiteKey: 'site-1',
  services: [lunch, frenchDay],
};

describe('WhoStep', () => {
  it('shows one chip per student and the services as a separate choice', async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    render(
      <WhoStep
        students={[student]}
        student={student}
        service={lunch}
        wallet={null}
        onChoose={onChoose}
        onContinue={() => {}}
      />,
    );

    const students = screen.getByRole('group', { name: 'Student' });
    expect(students.querySelectorAll('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Sam/ })).toHaveAttribute('aria-pressed', 'true');

    const services = screen.getByRole('group', { name: 'Order from' });
    expect(services.querySelectorAll('button')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Lunch' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Junior School French Day' }));
    expect(onChoose).toHaveBeenCalledWith(student, frenchDay);
  });

  it('hides the service choice when there is only one', () => {
    const single = { ...student, services: [lunch] };
    render(
      <WhoStep
        students={[single]}
        student={null}
        service={null}
        wallet={null}
        onChoose={() => {}}
        onContinue={() => {}}
      />,
    );
    expect(screen.queryByRole('group', { name: 'Order from' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose the days' })).toBeDisabled();
  });
});
